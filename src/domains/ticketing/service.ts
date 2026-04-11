import {
  EventStatus,
  NotificationType,
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  Role,
  ReservationStatus,
  ScopeType,
  TicketStatus,
  TicketTransferStatus,
  WaitlistStatus,
} from "@prisma/client";
import crypto from "node:crypto";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { getServerSessionOrNull } from "@/core/auth/session";
import { env } from "@/core/env";
import {
  cancelChapaTransaction,
  initializeChapaPayment,
  verifyChapaPayment,
} from "@/core/chapa/client";
import type { ChapaCallbackPayload } from "@/core/chapa/types";
import { verifyChapaPayloadSignature } from "@/core/chapa/signature";
import { prisma } from "@/core/db/prisma";
import {
  extractTraceContextFromMetadata,
  getTraceMetadataFromContext,
  withObservabilityContext,
} from "@/core/observability/context";
import { TICKET_QR_PREFIX } from "@/domains/checkin/qr-payload";
import { createSignedTicketQrToken } from "@/domains/checkin/qr-signing";
import { TicketingDomainError } from "@/domains/ticketing/errors";
import type {
  CheckoutInput,
  ChapaCallbackInput,
  ChapaTransactionProcessResult,
  ClaimWaitlistInput,
  CreateReservationInput,
  InitializePaymentInput,
  JoinWaitlistInput,
  PaymentReconciliationResult,
  RetryPaymentInput,
  OrderPaymentStatusSnapshot,
  TicketCancellationInput,
  TicketTransferRequestInput,
  TicketTransferResponseInput,
  TicketingMaintenanceResult,
} from "@/domains/ticketing/types";
import {
  AuthorizationError,
  createAccessContext,
  requirePermission,
} from "@/domains/identity/guards";
import { ROLE_DEFAULT_PERMISSIONS } from "@/domains/identity/types";
import {
  enqueueSystemNotification,
  enqueueOrderConfirmationNotification,
} from "@/domains/notifications/service";

const DEFAULT_RESERVATION_TTL_MINUTES = 15;

const reservationSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Reservation idempotency key must contain at least 8 characters.")
    .max(120, "Reservation idempotency key cannot exceed 120 characters."),
  source: z
    .string()
    .trim()
    .max(80, "Reservation source cannot exceed 80 characters.")
    .optional(),
  ttlMinutes: z.coerce
    .number()
    .int("Reservation TTL must be an integer.")
    .min(1, "Reservation TTL must be at least 1 minute.")
    .max(120, "Reservation TTL cannot exceed 120 minutes.")
    .optional(),
  items: z
    .array(
      z.object({
        ticketClassId: z.string().trim().min(1, "Ticket class id is required."),
        quantity: z.coerce
          .number()
          .int("Reservation quantity must be an integer.")
          .min(1, "Reservation quantity must be at least 1."),
        accessCode: z
          .string()
          .trim()
          .max(64, "Access code cannot exceed 64 characters.")
          .optional(),
      }),
    )
    .min(1, "At least one ticket class item is required.")
    .max(20, "Reservation cannot include more than 20 line items."),
});

const waitlistJoinSchema = z.object({
  ticketClassId: z.string().trim().min(1, "Ticket class id is required."),
});

const waitlistClaimSchema = z.object({
  ticketClassId: z.string().trim().min(1, "Ticket class id is required."),
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Claim idempotency key must contain at least 8 characters.")
    .max(120, "Claim idempotency key cannot exceed 120 characters."),
});

const checkoutSchema = z.object({
  buyer: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Buyer name must contain at least 2 characters.")
      .max(120, "Buyer name cannot exceed 120 characters."),
    email: z.email("Buyer email must be a valid email address."),
    phoneNumber: z
      .string()
      .trim()
      .max(40, "Buyer phone number cannot exceed 40 characters.")
      .optional(),
  }),
  attendees: z.array(
    z.object({
      ticketClassId: z.string().trim().min(1, "Ticket class id is required."),
      attendeeUserId: z.string().trim().optional(),
      attendeeEmail: z.string().trim().optional(),
      attendeeName: z.string().trim().optional(),
    }),
  ),
  customFields: z.unknown().optional(),
  promoCode: z
    .string()
    .trim()
    .max(40, "Promo code cannot exceed 40 characters.")
    .optional(),
  referralCode: z
    .string()
    .trim()
    .max(40, "Referral code cannot exceed 40 characters.")
    .optional(),
  invoiceRequested: z.boolean().optional(),
  checkoutSessionFingerprint: z
    .string()
    .trim()
    .max(120, "Checkout session fingerprint cannot exceed 120 characters.")
    .optional(),
  allowDuplicatePurchase: z.boolean().optional(),
});

const initPaymentSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Payment idempotency key must contain at least 8 characters.")
    .max(120, "Payment idempotency key cannot exceed 120 characters."),
  returnUrl: z.url("Return URL must be a valid URL.").optional(),
  callbackUrl: z.url("Callback URL must be a valid URL.").optional(),
});

const retryPaymentSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Payment retry idempotency key must contain at least 8 characters.")
    .max(120, "Payment retry idempotency key cannot exceed 120 characters."),
  returnUrl: z.url("Return URL must be a valid URL.").optional(),
});

const transferRequestSchema = z.object({
  toUserEmail: z.email("Transfer target email must be a valid email address."),
  expiresInHours: z.coerce
    .number()
    .int("Transfer expiry must be an integer number of hours.")
    .min(1, "Transfer expiry must be at least 1 hour.")
    .max(168, "Transfer expiry cannot exceed 168 hours.")
    .optional(),
  reason: z
    .string()
    .trim()
    .max(240, "Transfer reason cannot exceed 240 characters.")
    .optional(),
});

const transferResponseSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
  reason: z
    .string()
    .trim()
    .max(240, "Transfer response reason cannot exceed 240 characters.")
    .optional(),
});

const cancellationSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(240, "Cancellation reason cannot exceed 240 characters.")
    .optional(),
});

function now() {
  return new Date();
}

function computeExpiresAt(ttlMinutes?: number) {
  const ttl = ttlMinutes ?? DEFAULT_RESERVATION_TTL_MINUTES;
  return new Date(Date.now() + ttl * 60_000);
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function orderCurrencyUpper(currency: string): string {
  return currency.trim().toUpperCase();
}

function isSuccessfulPaymentStatus(status: string): boolean {
  return ["SUCCESS", "CAPTURED", "PAID"].includes(status);
}

function isFailedPaymentStatus(status: string): boolean {
  return ["FAILED", "CANCELLED", "REVERSED", "EXPIRED", "ERROR"].includes(status);
}

function isPendingPaymentStatus(status: string): boolean {
  return ["PENDING", "PROCESSING", "INITIATED"].includes(status);
}

function isTerminalPaymentAttemptStatus(status: PaymentAttemptStatus): boolean {
  const terminalStatuses: PaymentAttemptStatus[] = [
    PaymentAttemptStatus.CAPTURED,
    PaymentAttemptStatus.FAILED,
    PaymentAttemptStatus.VOIDED,
    PaymentAttemptStatus.REFUNDED,
  ];

  return terminalStatuses.includes(status);
}

function normalizeProviderEventId(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toChapaCallbackInput(payload: unknown): ChapaCallbackInput {
  const body = payload as ChapaCallbackPayload;
  const data = body?.data;

  const txRef =
    normalizeProviderEventId(data?.tx_ref) ??
    normalizeProviderEventId(body?.tx_ref) ??
    normalizeProviderEventId(body?.trx_ref);

  if (!txRef) {
    throw new TicketingDomainError(
      400,
      "BAD_REQUEST",
      "Callback payload is missing tx_ref/trx_ref.",
    );
  }

  const providerEventId =
    normalizeProviderEventId(data?.id) ??
    normalizeProviderEventId(data?.ref_id) ??
    normalizeProviderEventId(body?.ref_id) ??
    normalizeProviderEventId(body?.reference) ??
    txRef;

  return {
    txRef,
    providerEventId,
    payload,
  };
}

function toCurrencyAmount(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function parseOptionalJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as Prisma.InputJsonValue;
    } catch {
      throw new TicketingDomainError(
        400,
        "BAD_REQUEST",
        "JSON payload fields must contain valid JSON.",
      );
    }
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  throw new TicketingDomainError(
    400,
    "BAD_REQUEST",
    "JSON payload fields must be objects or arrays.",
  );
}

function aggregateReservationItems(items: CreateReservationInput["items"]) {
  const map = new Map<
    string,
    {
      quantity: number;
      accessCode?: string;
    }
  >();

  for (const item of items) {
    const existing = map.get(item.ticketClassId);

    if (existing) {
      existing.quantity += item.quantity;

      if (!existing.accessCode && item.accessCode) {
        existing.accessCode = item.accessCode;
      }

      continue;
    }

    map.set(item.ticketClassId, {
      quantity: item.quantity,
      accessCode: item.accessCode,
    });
  }

  return Array.from(map.entries()).map(([ticketClassId, value]) => ({
    ticketClassId,
    quantity: value.quantity,
    accessCode: value.accessCode,
  }));
}

async function lockEventRow(tx: Prisma.TransactionClient, eventId: string) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
}

async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

async function lockTicketClassRows(
  tx: Prisma.TransactionClient,
  ticketClassIds: string[],
) {
  const uniqueSortedIds = Array.from(new Set(ticketClassIds)).sort();

  for (const ticketClassId of uniqueSortedIds) {
    await tx.$queryRaw`SELECT id FROM "TicketClass" WHERE id = ${ticketClassId} FOR UPDATE`;
  }
}

async function getEventInventoryState(
  tx: Prisma.TransactionClient,
  eventId: string,
  totalCapacity: number | null,
) {
  if (totalCapacity === null) {
    return null;
  }

  const [soldCount, activeHoldCount] = await Promise.all([
    tx.ticket.aggregate({
      where: {
        eventId,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      _count: {
        _all: true,
      },
    }),
    tx.reservationItem.aggregate({
      where: {
        reservation: {
          eventId,
          status: ReservationStatus.PENDING,
          expiresAt: {
            gt: now(),
          },
        },
      },
      _sum: {
        quantity: true,
      },
    }),
  ]);

  const sold = soldCount._count._all;
  const activeHolds = activeHoldCount._sum.quantity ?? 0;
  const blocked = 0;

  return {
    capacity: totalCapacity,
    sold,
    activeHolds,
    blocked,
    available: totalCapacity - sold - activeHolds - blocked,
  };
}

function assertUniqueConstraintError(
  error: unknown,
  fieldName: string,
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).includes(fieldName));
  }

  return String(target ?? "").includes(fieldName);
}

async function requireTicketingPermission(
  eventId: string,
  permission: "ticket.manage" | "event.read",
  action: string,
) {
  const context = createAccessContext(ScopeType.EVENT, eventId);
  return requirePermission({
    context,
    permission,
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function requireTicketingSelfServicePermission(eventId: string, action: string) {
  try {
    return await requireTicketingPermission(eventId, "event.read", action);
  } catch (error) {
    if (!(error instanceof AuthorizationError) || error.status !== 403) {
      throw error;
    }

    const session = await getServerSessionOrNull();

    if (!session) {
      throw new AuthorizationError(401, "Authentication is required.");
    }

    await prisma.roleBinding.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId: session.user.id,
          role: Role.ATTENDEE,
          scopeType: ScopeType.PERSONAL,
          scopeId: session.user.id,
        },
      },
      update: {
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ATTENDEE],
      },
      create: {
        userId: session.user.id,
        role: Role.ATTENDEE,
        scopeType: ScopeType.PERSONAL,
        scopeId: session.user.id,
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ATTENDEE],
      },
    });

    return requirePermission({
      context: createAccessContext(ScopeType.PERSONAL, session.user.id),
      permission: "profile.manage",
      action: `${action}.self_service`,
      targetType: "Event",
      targetId: eventId,
    });
  }
}

async function loadEventForTicketing(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      totalCapacity: true,
      ticketSalesPaused: true,
    },
  });

  if (!event) {
    throw new TicketingDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

function ensureEventOpenForReservations(event: {
  status: EventStatus;
  ticketSalesPaused: boolean;
}) {
  const allowedStatuses = new Set<EventStatus>([EventStatus.PUBLISHED, EventStatus.LIVE]);

  if (!allowedStatuses.has(event.status)) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Reservations are allowed only when event status is PUBLISHED or LIVE.",
    );
  }

  if (event.ticketSalesPaused) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Ticket sales are currently paused for this event.",
    );
  }
}

type TicketClassSnapshot = {
  id: string;
  name: string;
  hidden: boolean;
  unlockCode: string | null;
  salesStartAt: Date;
  salesEndAt: Date;
  capacity: number;
  perOrderLimit: number;
  type: "FREE" | "PAID" | "VIP";
  price: Prisma.Decimal;
  currency: string;
};

async function loadTicketClassesForReservation(
  eventId: string,
  ticketClassIds: string[],
  dbClient: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const uniqueTicketClassIds = Array.from(new Set(ticketClassIds));

  const ticketClasses = await dbClient.ticketClass.findMany({
    where: {
      eventId,
      id: {
        in: uniqueTicketClassIds,
      },
    },
    select: {
      id: true,
      name: true,
      hidden: true,
      unlockCode: true,
      salesStartAt: true,
      salesEndAt: true,
      capacity: true,
      perOrderLimit: true,
      type: true,
      price: true,
      currency: true,
    },
  });

  if (ticketClasses.length !== uniqueTicketClassIds.length) {
    throw new TicketingDomainError(
      404,
      "TICKET_CLASS_NOT_FOUND",
      "One or more ticket classes were not found in this event.",
    );
  }

  const map = new Map<string, TicketClassSnapshot>();
  for (const ticketClass of ticketClasses) {
    map.set(ticketClass.id, ticketClass);
  }

  return map;
}

async function getTicketClassInventoryState(
  tx: Prisma.TransactionClient,
  ticketClassId: string,
) {
  const [ticketClass, soldCount, activeHoldCount] = await Promise.all([
    tx.ticketClass.findUnique({
      where: {
        id: ticketClassId,
      },
      select: {
        capacity: true,
      },
    }),
    tx.ticket.aggregate({
      where: {
        ticketClassId,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      _count: {
        _all: true,
      },
    }),
    tx.reservationItem.aggregate({
      where: {
        ticketClassId,
        reservation: {
          status: ReservationStatus.PENDING,
          expiresAt: {
            gt: now(),
          },
        },
      },
      _sum: {
        quantity: true,
      },
    }),
  ]);

  if (!ticketClass) {
    throw new TicketingDomainError(
      404,
      "TICKET_CLASS_NOT_FOUND",
      "Ticket class not found.",
    );
  }

  const sold = soldCount._count._all;
  const activeHolds = activeHoldCount._sum.quantity ?? 0;
  const blocked = 0;

  return {
    capacity: ticketClass.capacity,
    sold,
    activeHolds,
    blocked,
    available: ticketClass.capacity - sold - activeHolds - blocked,
  };
}

function assertInventoryInvariant(state: {
  capacity: number;
  sold: number;
  activeHolds: number;
  blocked: number;
}) {
  if (state.sold + state.activeHolds + state.blocked > state.capacity) {
    throw new TicketingDomainError(
      409,
      "INVENTORY_UNAVAILABLE",
      "Inventory invariant violated: sold + activeHolds + blocked must not exceed capacity.",
    );
  }
}

async function expireReservationsTx(
  tx: Prisma.TransactionClient,
  eventId?: string,
): Promise<number> {
  const result = await tx.reservation.updateMany({
    where: {
      status: ReservationStatus.PENDING,
      expiresAt: {
        lte: now(),
      },
      ...(eventId
        ? {
            eventId,
          }
        : {}),
    },
    data: {
      status: ReservationStatus.EXPIRED,
    },
  });

  return result.count;
}

function computeOrderTotals(
  ticketClasses: Map<string, TicketClassSnapshot>,
  items: Array<{ ticketClassId: string; quantity: number }>,
  promoCode?: string,
) {
  let subtotal = 0;

  for (const item of items) {
    const ticketClass = ticketClasses.get(item.ticketClassId);

    if (!ticketClass) {
      throw new TicketingDomainError(
        404,
        "TICKET_CLASS_NOT_FOUND",
        "Ticket class not found for order pricing.",
      );
    }

    subtotal += toCurrencyAmount(ticketClass.price) * item.quantity;
  }

  const discount = promoCode ? Math.min(subtotal * 0.1, subtotal) : 0;
  const tax = 0;
  const fee = subtotal > 0 ? Math.round(subtotal * 0.03 * 100) / 100 : 0;
  const total = Math.max(0, subtotal - discount + tax + fee);

  return {
    subtotal,
    discount,
    tax,
    fee,
    total,
  };
}

function generateInvoiceReference(orderId: string) {
  return `INV-${orderId.slice(-8).toUpperCase()}`;
}

function generateTicketQrToken(input: {
  ticketId: string;
  buyerId: string;
  eventId: string;
  boughtAt: Date;
}) {
  return createSignedTicketQrToken(
    {
      version: 1,
      ticketId: input.ticketId,
      buyerId: input.buyerId,
      eventId: input.eventId,
      boughtAt: input.boughtAt.toISOString(),
    },
    env.CHECKIN_QR_SECRET ?? env.BETTER_AUTH_SECRET,
  );
}

async function rotateLegacyTicketQrTokens(eventId?: string) {
  const batchSize = 200;
  let rotated = 0;

  while (true) {
    const legacyTickets = await prisma.ticket.findMany({
      where: {
        ...(eventId
          ? {
              eventId,
            }
          : {}),
        qrToken: {
          not: {
            startsWith: `${TICKET_QR_PREFIX}.`,
          },
        },
      },
      select: {
        id: true,
        eventId: true,
        issuedAt: true,
        order: {
          select: {
            buyerUserId: true,
          },
        },
      },
      orderBy: {
        issuedAt: "asc",
      },
      take: batchSize,
    });

    if (legacyTickets.length === 0) {
      break;
    }

    const updateOperations = legacyTickets.map((ticket) => prisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        qrToken: generateTicketQrToken({
          ticketId: ticket.id,
          buyerId: ticket.order.buyerUserId,
          eventId: ticket.eventId,
          boughtAt: ticket.issuedAt,
        }),
      },
    }));

    await prisma.$transaction(updateOperations);

    rotated += updateOperations.length;

    if (legacyTickets.length < batchSize) {
      break;
    }
  }

  return rotated;
}

function assertWebhookSignature(
  receivedSignature: string | null,
  rawBody: string,
) {
  if (
    !verifyChapaPayloadSignature({
      rawBody,
      signature: receivedSignature,
    })
  ) {
    throw new TicketingDomainError(
      401,
      "UNAUTHORIZED_WEBHOOK",
      "Webhook signature verification failed.",
    );
  }
}

function getTransferExpiry(hours?: number) {
  const ttl = hours ?? 24;
  return new Date(Date.now() + ttl * 60 * 60 * 1000);
}

function assertTicketCancelable(ticket: { status: TicketStatus }) {
  if (ticket.status !== TicketStatus.VALID) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Only VALID tickets can be cancelled.",
    );
  }
}

function assertTransferPending(transfer: {
  status: TicketTransferStatus;
  expiresAt: Date;
}) {
  if (transfer.status !== TicketTransferStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Transfer is not pending.",
    );
  }

  if (transfer.expiresAt.getTime() <= Date.now()) {
    throw new TicketingDomainError(409, "INVALID_STATE", "Transfer has expired.");
  }
}

export function parseCreateReservationInput(payload: unknown): CreateReservationInput {
  const parsed = reservationSchema.parse(payload);

  return {
    idempotencyKey: parsed.idempotencyKey,
    source: normalizeOptionalText(parsed.source),
    ttlMinutes: parsed.ttlMinutes,
    items: parsed.items.map((item) => ({
      ticketClassId: item.ticketClassId,
      quantity: item.quantity,
      accessCode: normalizeOptionalText(item.accessCode),
    })),
  };
}

export function parseJoinWaitlistInput(payload: unknown): JoinWaitlistInput {
  const parsed = waitlistJoinSchema.parse(payload);

  return {
    ticketClassId: parsed.ticketClassId,
  };
}

export function parseClaimWaitlistInput(payload: unknown): ClaimWaitlistInput {
  const parsed = waitlistClaimSchema.parse(payload);

  return {
    ticketClassId: parsed.ticketClassId,
    idempotencyKey: parsed.idempotencyKey,
  };
}

export function parseCheckoutInput(payload: unknown): CheckoutInput {
  const parsed = checkoutSchema.parse(payload);

  return {
    buyer: {
      name: parsed.buyer.name,
      email: parsed.buyer.email,
      phoneNumber: normalizeOptionalText(parsed.buyer.phoneNumber),
    },
    attendees: parsed.attendees,
    customFields: parseOptionalJson(parsed.customFields),
    promoCode: normalizeOptionalText(parsed.promoCode),
    referralCode: normalizeOptionalText(parsed.referralCode),
    invoiceRequested: parsed.invoiceRequested ?? false,
    checkoutSessionFingerprint: normalizeOptionalText(parsed.checkoutSessionFingerprint),
    allowDuplicatePurchase: parsed.allowDuplicatePurchase ?? false,
  };
}

export function parseInitializePaymentInput(payload: unknown): InitializePaymentInput {
  const parsed = initPaymentSchema.parse(payload);

  return {
    idempotencyKey: parsed.idempotencyKey,
    returnUrl: normalizeOptionalText(parsed.returnUrl),
    callbackUrl: normalizeOptionalText(parsed.callbackUrl),
  };
}

export function parseRetryPaymentInput(payload: unknown): RetryPaymentInput {
  const parsed = retryPaymentSchema.parse(payload);

  return {
    idempotencyKey: parsed.idempotencyKey,
    returnUrl: normalizeOptionalText(parsed.returnUrl),
  };
}

export function parseTicketTransferRequestInput(
  payload: unknown,
): TicketTransferRequestInput {
  const parsed = transferRequestSchema.parse(payload);

  return {
    toUserEmail: parsed.toUserEmail,
    expiresInHours: parsed.expiresInHours,
    reason: normalizeOptionalText(parsed.reason),
  };
}

export function parseTicketTransferResponseInput(
  payload: unknown,
): TicketTransferResponseInput {
  const parsed = transferResponseSchema.parse(payload);

  return {
    action: parsed.action,
    reason: normalizeOptionalText(parsed.reason),
  };
}

export function parseTicketCancellationInput(
  payload: unknown,
): TicketCancellationInput {
  const parsed = cancellationSchema.parse(payload);

  return {
    reason: normalizeOptionalText(parsed.reason),
  };
}

export async function createReservation(eventId: string, input: CreateReservationInput) {
  const parsedInput = parseCreateReservationInput(input);
  const normalizedItems = aggregateReservationItems(parsedInput.items);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.reservation.create");
  const event = await loadEventForTicketing(eventId);

  ensureEventOpenForReservations(event);

  const existingReservation = await prisma.reservation.findUnique({
    where: {
      idempotencyKey: parsedInput.idempotencyKey,
    },
    include: {
      items: true,
    },
  });

  if (existingReservation) {
    if (
      existingReservation.eventId === eventId &&
      existingReservation.userId === authz.session.user.id
    ) {
      return existingReservation;
    }

    throw new TicketingDomainError(
      409,
      "UNPROCESSABLE_TICKETING",
      "Reservation idempotency key is already in use.",
    );
  }

  const expiresAt = computeExpiresAt(parsedInput.ttlMinutes);
  const totalRequestedQuantity = normalizedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      await expireReservationsTx(tx, eventId);
      await lockEventRow(tx, eventId);
      await lockTicketClassRows(
        tx,
        normalizedItems.map((item) => item.ticketClassId),
      );

      const ticketClassMap = await loadTicketClassesForReservation(
        eventId,
        normalizedItems.map((item) => item.ticketClassId),
        tx,
      );

      for (const item of normalizedItems) {
        const ticketClass = ticketClassMap.get(item.ticketClassId)!;
        const currentTime = now();

        if (currentTime.getTime() < ticketClass.salesStartAt.getTime()) {
          throw new TicketingDomainError(
            409,
            "INVALID_STATE",
            `Sales have not started for ticket class ${ticketClass.name}.`,
          );
        }

        if (currentTime.getTime() > ticketClass.salesEndAt.getTime()) {
          throw new TicketingDomainError(
            409,
            "INVALID_STATE",
            `Sales have ended for ticket class ${ticketClass.name}.`,
          );
        }

        if (item.quantity > ticketClass.perOrderLimit) {
          throw new TicketingDomainError(
            422,
            "UNPROCESSABLE_TICKETING",
            `Requested quantity exceeds per-order limit for ticket class ${ticketClass.name}.`,
          );
        }

        if (ticketClass.hidden) {
          const expectedCode = normalizeOptionalText(ticketClass.unlockCode ?? undefined);
          const suppliedCode = normalizeOptionalText(item.accessCode);

          if (!expectedCode || suppliedCode !== expectedCode) {
            throw new TicketingDomainError(
              403,
              "UNPROCESSABLE_TICKETING",
              `Access code is required for hidden ticket class ${ticketClass.name}.`,
            );
          }
        }

        const inventoryState = await getTicketClassInventoryState(tx, item.ticketClassId);
        assertInventoryInvariant(inventoryState);

        if (inventoryState.available < item.quantity) {
          throw new TicketingDomainError(
            409,
            "INVENTORY_UNAVAILABLE",
            `Insufficient inventory for ticket class ${ticketClass.name}.`,
          );
        }
      }

      const eventInventory = await getEventInventoryState(
        tx,
        eventId,
        event.totalCapacity,
      );

      if (eventInventory) {
        assertInventoryInvariant(eventInventory);

        if (eventInventory.available < totalRequestedQuantity) {
          throw new TicketingDomainError(
            409,
            "INVENTORY_UNAVAILABLE",
            "Insufficient event-level capacity for this reservation.",
          );
        }
      }

      const createdReservation = await tx.reservation.create({
        data: {
          eventId,
          userId: authz.session.user.id,
          status: ReservationStatus.PENDING,
          expiresAt,
          source: parsedInput.source,
          idempotencyKey: parsedInput.idempotencyKey,
          items: {
            create: normalizedItems.map((item) => ({
              ticketClassId: item.ticketClassId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return createdReservation;
    });

    await writeAuditEvent({
      actorId: authz.session.user.id,
      action: "ticketing.reservation.created",
      scopeType: ScopeType.EVENT,
      scopeId: eventId,
      targetType: "Reservation",
      targetId: reservation.id,
      newValue: {
        expiresAt: reservation.expiresAt.toISOString(),
        itemCount: reservation.items.length,
      },
    });

    return reservation;
  } catch (error) {
    if (assertUniqueConstraintError(error, "idempotencyKey")) {
      const retryReservation = await prisma.reservation.findUnique({
        where: {
          idempotencyKey: parsedInput.idempotencyKey,
        },
        include: {
          items: true,
        },
      });

      if (
        retryReservation &&
        retryReservation.eventId === eventId &&
        retryReservation.userId === authz.session.user.id
      ) {
        return retryReservation;
      }

      throw new TicketingDomainError(
        409,
        "UNPROCESSABLE_TICKETING",
        "Reservation idempotency key is already in use.",
      );
    }

    throw error;
  }
}

export async function getActiveReservationForUser(eventId: string) {
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.reservation.active.read");

  return prisma.reservation.findFirst({
    where: {
      eventId,
      userId: authz.session.user.id,
      status: ReservationStatus.PENDING,
      expiresAt: {
        gt: now(),
      },
    },
    include: {
      items: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getMyEventTickets(eventId: string) {
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.tickets.mine.read");

  return prisma.ticket.findMany({
    where: {
      eventId,
      OR: [{ ownerId: authz.session.user.id }, { attendeeId: authz.session.user.id }],
    },
    include: {
      ticketClass: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
        },
      },
      transfers: {
        where: {
          status: TicketTransferStatus.PENDING,
          expiresAt: {
            gt: now(),
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      issuedAt: "desc",
    },
  });
}

export async function getMyOrderPaymentStatus(
  eventId: string,
  orderId: string,
): Promise<OrderPaymentStatusSnapshot> {
  const authz = await requireTicketingSelfServicePermission(
    eventId,
    "payments.status.mine.read",
  );

  const loadOrderStatusRecord = () =>
    prisma.order.findFirst({
      where: {
        id: orderId,
        eventId,
        buyerUserId: authz.session.user.id,
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        currency: true,
        completedAt: true,
        updatedAt: true,
        paymentAttempts: {
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            status: true,
            provider: true,
            providerReference: true,
            checkoutUrl: true,
            failureCode: true,
            updatedAt: true,
          },
        },
      },
    });

  let order = await loadOrderStatusRecord();

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  const shouldSynchronizeWithProvider = (() => {
    const latestAttempt = order.paymentAttempts[0];

    if (!latestAttempt) {
      return false;
    }

    if (order.status === OrderStatus.COMPLETED) {
      return false;
    }

    if (latestAttempt.provider !== "CHAPA" || !latestAttempt.providerReference) {
      return false;
    }

    return !isTerminalPaymentAttemptStatus(latestAttempt.status);
  })();

  if (shouldSynchronizeWithProvider) {
    const latestAttempt = order.paymentAttempts[0]!;

    try {
      await processChapaTransactionByReference(
        latestAttempt.providerReference!,
        latestAttempt.providerReference!,
        {
          source: "status_sync",
          orderId,
          paymentAttemptId: latestAttempt.id,
        },
      );

      const refreshedOrder = await loadOrderStatusRecord();
      if (refreshedOrder) {
        order = refreshedOrder;
      }
    } catch {
      // Ignore sync failures here; caller still receives the latest persisted snapshot.
    }
  }

  const latestAttempt = order.paymentAttempts[0];

  const isFinal =
    order.status === OrderStatus.COMPLETED ||
    latestAttempt?.status === PaymentAttemptStatus.CAPTURED ||
    latestAttempt?.status === PaymentAttemptStatus.FAILED ||
    latestAttempt?.status === PaymentAttemptStatus.VOIDED ||
    latestAttempt?.status === PaymentAttemptStatus.REFUNDED;

  return {
    orderId: order.id,
    orderStatus: order.status,
    totalAmount: toCurrencyAmount(order.totalAmount),
    currency: order.currency,
    paymentAttemptId: latestAttempt?.id,
    paymentAttemptStatus: latestAttempt?.status,
    paymentProvider: latestAttempt?.provider,
    providerReference: latestAttempt?.providerReference ?? undefined,
    checkoutUrl: latestAttempt?.checkoutUrl ?? undefined,
    failureCode: latestAttempt?.failureCode ?? undefined,
    completedAt: order.completedAt?.toISOString(),
    updatedAt: (latestAttempt?.updatedAt ?? order.updatedAt).toISOString(),
    isFinal,
  };
}

export async function expireStaleReservations(eventId?: string) {
  const updated = await prisma.$transaction(async (tx) => expireReservationsTx(tx, eventId));

  return {
    expired: updated,
  };
}

export async function joinWaitlist(eventId: string, input: JoinWaitlistInput) {
  const parsedInput = parseJoinWaitlistInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.waitlist.join");

  const ticketClass = await prisma.ticketClass.findFirst({
    where: {
      eventId,
      id: parsedInput.ticketClassId,
    },
    select: {
      id: true,
    },
  });

  if (!ticketClass) {
    throw new TicketingDomainError(
      404,
      "TICKET_CLASS_NOT_FOUND",
      "Ticket class not found for waitlist join.",
    );
  }

  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      eventId,
      ticketClassId: parsedInput.ticketClassId,
      userId: authz.session.user.id,
      status: {
        in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED],
      },
    },
  });

  if (existing) {
    return existing;
  }

  const currentMax = await prisma.waitlistEntry.aggregate({
    where: {
      eventId,
      ticketClassId: parsedInput.ticketClassId,
    },
    _max: {
      priority: true,
    },
  });

  const waitlistEntry = await prisma.waitlistEntry.create({
    data: {
      eventId,
      ticketClassId: parsedInput.ticketClassId,
      userId: authz.session.user.id,
      priority: (currentMax._max.priority ?? 0) + 1,
      status: WaitlistStatus.WAITING,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "ticketing.waitlist.joined",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "WaitlistEntry",
    targetId: waitlistEntry.id,
    newValue: {
      ticketClassId: waitlistEntry.ticketClassId,
      priority: waitlistEntry.priority,
    },
  });

  return waitlistEntry;
}

export async function claimWaitlistSpot(eventId: string, input: ClaimWaitlistInput) {
  const parsedInput = parseClaimWaitlistInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.waitlist.claim");

  const waitlistEntry = await prisma.waitlistEntry.findFirst({
    where: {
      eventId,
      ticketClassId: parsedInput.ticketClassId,
      userId: authz.session.user.id,
      status: WaitlistStatus.NOTIFIED,
      claimExpiresAt: {
        gt: now(),
      },
    },
  });

  if (!waitlistEntry) {
    throw new TicketingDomainError(
      404,
      "WAITLIST_ENTRY_NOT_FOUND",
      "No active notified waitlist entry found for this ticket class.",
    );
  }

  const reservation = await createReservation(eventId, {
    idempotencyKey: parsedInput.idempotencyKey,
    source: "waitlist-claim",
    ttlMinutes: 10,
    items: [
      {
        ticketClassId: parsedInput.ticketClassId,
        quantity: 1,
      },
    ],
  });

  await prisma.waitlistEntry.update({
    where: {
      id: waitlistEntry.id,
    },
    data: {
      status: WaitlistStatus.CLAIMED,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "ticketing.waitlist.claimed",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "WaitlistEntry",
    targetId: waitlistEntry.id,
    newValue: {
      reservationId: reservation.id,
    },
  });

  return reservation;
}

export async function promoteWaitlist(eventId: string) {
  const event = await loadEventForTicketing(eventId);

  const promotedEntries = await prisma.$transaction(async (tx) => {
    await expireReservationsTx(tx, eventId);
    await lockEventRow(tx, eventId);

    const waitingEntries = await tx.waitlistEntry.findMany({
      where: {
        eventId,
        status: WaitlistStatus.WAITING,
      },
      orderBy: {
        priority: "asc",
      },
      take: 100,
    });

    await lockTicketClassRows(
      tx,
      waitingEntries.map((entry) => entry.ticketClassId),
    );

    const perClassAvailable = new Map<string, number>();

    for (const ticketClassId of new Set(waitingEntries.map((entry) => entry.ticketClassId))) {
      const inventoryState = await getTicketClassInventoryState(tx, ticketClassId);
      assertInventoryInvariant(inventoryState);
      perClassAvailable.set(ticketClassId, inventoryState.available);
    }

    const eventInventory = await getEventInventoryState(tx, eventId, event.totalCapacity);
    if (eventInventory) {
      assertInventoryInvariant(eventInventory);
    }

    let eventAvailability = eventInventory?.available ?? Number.POSITIVE_INFINITY;

    const promoted: Array<{
      id: string;
      userId: string;
      ticketClassId: string;
      claimExpiresAt: Date;
    }> = [];

    for (const entry of waitingEntries) {
      const classAvailability = perClassAvailable.get(entry.ticketClassId) ?? 0;

      if (classAvailability <= 0 || eventAvailability <= 0) {
        continue;
      }

      const claimExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await tx.waitlistEntry.update({
        where: {
          id: entry.id,
        },
        data: {
          status: WaitlistStatus.NOTIFIED,
          notifiedAt: now(),
          claimExpiresAt,
        },
      });

      perClassAvailable.set(entry.ticketClassId, classAvailability - 1);
      eventAvailability -= 1;

      promoted.push({
        id: entry.id,
        userId: entry.userId,
        ticketClassId: entry.ticketClassId,
        claimExpiresAt,
      });
    }

    return promoted;
  });

  const ticketClassById = new Map(
    (
      await prisma.ticketClass.findMany({
        where: {
          id: {
            in: Array.from(new Set(promotedEntries.map((entry) => entry.ticketClassId))),
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
    ).map((ticketClass) => [ticketClass.id, ticketClass.name]),
  );

  for (const entry of promotedEntries) {
    await writeAuditEvent({
      action: "ticketing.waitlist.notified",
      scopeType: ScopeType.EVENT,
      scopeId: eventId,
      targetType: "WaitlistEntry",
      targetId: entry.id,
    });

    void enqueueSystemNotification({
      eventId,
      userIds: [entry.userId],
      type: NotificationType.WAITLIST_PROMOTED,
      subject: `Waitlist spot opened for ${event.title}`,
      content: "A ticket is now available for claim. Complete checkout before the claim window expires.",
      idempotencyKeyBase: `txn:waitlist-promoted:${entry.id}`,
      metadata: {
        eventTitle: event.title,
        ticketClassName: ticketClassById.get(entry.ticketClassId) ?? "Ticket",
        claimExpiresAt: entry.claimExpiresAt.toISOString(),
        claimUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue waitlist promotion notification", {
        entryId: entry.id,
        eventId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return {
    promoted: promotedEntries.length,
    promotedIds: promotedEntries.map((entry) => entry.id),
  };
}

async function assertNoDuplicatePurchase(
  eventId: string,
  buyerUserId: string,
  fingerprint?: string,
) {
  const duplicateOrder = await prisma.order.findFirst({
    where: {
      eventId,
      buyerUserId,
      status: OrderStatus.COMPLETED,
      ...(fingerprint
        ? {
            checkoutSessionFingerprint: fingerprint,
          }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (duplicateOrder) {
    throw new TicketingDomainError(
      409,
      "DUPLICATE_PURCHASE",
      "Duplicate purchase detected for this buyer and checkout fingerprint.",
    );
  }
}

export async function createCheckoutOrder(eventId: string, reservationId: string, input: CheckoutInput) {
  const parsedInput = parseCheckoutInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticketing.checkout.create");

  const reservation = await prisma.reservation.findFirst({
    where: {
      id: reservationId,
      eventId,
      userId: authz.session.user.id,
    },
    include: {
      items: true,
      order: true,
    },
  });

  if (!reservation) {
    throw new TicketingDomainError(
      404,
      "RESERVATION_NOT_FOUND",
      "Reservation not found for checkout.",
    );
  }

  if (reservation.status !== ReservationStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Only pending reservations can be checked out.",
    );
  }

  if (reservation.expiresAt.getTime() <= Date.now()) {
    await prisma.reservation.update({
      where: {
        id: reservation.id,
      },
      data: {
        status: ReservationStatus.EXPIRED,
      },
    });

    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Reservation has expired.",
    );
  }

  if (reservation.order) {
    return reservation.order;
  }

  if (!parsedInput.allowDuplicatePurchase) {
    await assertNoDuplicatePurchase(
      eventId,
      authz.session.user.id,
      parsedInput.checkoutSessionFingerprint,
    );
  }

  const ticketClassMap = await loadTicketClassesForReservation(
    eventId,
    reservation.items.map((item) => item.ticketClassId),
  );

  const totals = computeOrderTotals(ticketClassMap, reservation.items, parsedInput.promoCode);
  const event = await loadEventForTicketing(eventId);

  const currency = reservation.items.length
    ? ticketClassMap.get(reservation.items[0].ticketClassId)?.currency ?? "USD"
    : "USD";

  const order = await prisma.order.create({
    data: {
      orgId: event.orgId,
      eventId,
      reservationId: reservation.id,
      buyerUserId: authz.session.user.id,
      buyerSnapshot: {
        ...parsedInput.buyer,
      },
      attendeeSnapshot: parsedInput.attendees as unknown as Prisma.InputJsonValue,
      customFieldResponses:
        parsedInput.customFields as Prisma.InputJsonValue | undefined,
      promoCode: parsedInput.promoCode,
      referralCode: parsedInput.referralCode,
      invoiceRequested: parsedInput.invoiceRequested ?? false,
      invoiceReference: parsedInput.invoiceRequested
        ? generateInvoiceReference(reservation.id)
        : undefined,
      checkoutSessionFingerprint: parsedInput.checkoutSessionFingerprint,
      status: OrderStatus.PENDING,
      subtotalAmount: totals.subtotal,
      taxAmount: totals.tax,
      feeAmount: totals.fee,
      discountAmount: totals.discount,
      totalAmount: totals.total,
      currency,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "ticketing.checkout.order_created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Order",
    targetId: order.id,
    newValue: {
      reservationId: order.reservationId,
      totalAmount: order.totalAmount.toString(),
      currency: order.currency,
      promoCode: order.promoCode,
      referralCode: order.referralCode,
      invoiceRequested: order.invoiceRequested,
    },
  });

  return order;
}

export async function initializeOrderPayment(
  eventId: string,
  orderId: string,
  input: InitializePaymentInput,
) {
  const parsedInput = parseInitializePaymentInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "payments.initialize");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      eventId,
      buyerUserId: authz.session.user.id,
    },
    include: {
      reservation: true,
    },
  });

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  if (order.status !== OrderStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Payment can only be initialized for pending orders.",
    );
  }

  if (order.reservation.status !== ReservationStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Order reservation is no longer active.",
    );
  }

  if (order.reservation.expiresAt.getTime() <= Date.now()) {
    await prisma.reservation.update({
      where: {
        id: order.reservation.id,
      },
      data: {
        status: ReservationStatus.EXPIRED,
      },
    });

    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Reservation has expired before payment initialization.",
    );
  }

  const existingAttempt = await prisma.paymentAttempt.findUnique({
    where: {
      idempotencyKey: parsedInput.idempotencyKey,
    },
  });

  if (existingAttempt) {
    if (existingAttempt.orderId !== order.id) {
      throw new TicketingDomainError(
        409,
        "UNPROCESSABLE_TICKETING",
        "Payment idempotency key is already associated with another order.",
      );
    }

    return existingAttempt;
  }

  if (toCurrencyAmount(order.totalAmount) === 0) {
    const paymentAttempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "FREE",
        status: PaymentAttemptStatus.CAPTURED,
        amount: 0,
        currency: order.currency,
        idempotencyKey: parsedInput.idempotencyKey,
        metadata: {
          flow: "free-order",
        },
      },
    });

    await markOrderCaptured(
      order.id,
      paymentAttempt.id,
      `FREE-${paymentAttempt.id}`,
      null,
      {
        flow: "free-order",
      },
    );

    return paymentAttempt;
  }

  const buyerSnapshot = order.buyerSnapshot as { name?: string; email?: string; phoneNumber?: string } | null;
  const buyerName = (buyerSnapshot?.name ?? "Buyer").trim();
  const nameParts = buyerName.split(/\s+/g).filter(Boolean);
  const firstName = nameParts[0] ?? "Buyer";
  const lastName = nameParts.slice(1).join(" ") || "User";
  const email = (buyerSnapshot?.email ?? "buyer@example.com").trim();

  const txRef = `order-${order.id}-${Date.now()}`;
  const callbackUrl =
    parsedInput.callbackUrl ??
    `${env.NEXT_PUBLIC_APP_URL}/api/payments/chapa/callback`;
  const returnUrl =
    parsedInput.returnUrl ??
    `${env.NEXT_PUBLIC_APP_URL}/attendee/orders?orderId=${order.id}`;
  const traceMetadata = getTraceMetadataFromContext();

  const chapaResponse = await initializeChapaPayment({
    amount: toCurrencyAmount(order.totalAmount).toFixed(2),
    currency: order.currency,
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: returnUrl,
    customization: {
      title: "Ticket Purchase",
      description: `Order ${order.id}`,
    },
    customer: {
      email,
      firstName,
      lastName,
      phoneNumber: buyerSnapshot?.phoneNumber,
    },
  });

  if (chapaResponse.status !== "success" || !chapaResponse.data?.checkout_url) {
    throw new TicketingDomainError(
      502,
      "UNPROCESSABLE_TICKETING",
      chapaResponse.message || "Failed to initialize payment with Chapa.",
    );
  }

  const attempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: "CHAPA",
      providerReference: txRef,
      status: PaymentAttemptStatus.INITIATED,
      amount: order.totalAmount,
      currency: order.currency,
      idempotencyKey: parsedInput.idempotencyKey,
      checkoutUrl: chapaResponse.data.checkout_url,
      metadata: {
        callbackUrl,
        returnUrl,
        ...(traceMetadata ? { observability: traceMetadata } : {}),
      },
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "payments.initialized",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "PaymentAttempt",
    targetId: attempt.id,
    newValue: {
      orderId: order.id,
      providerReference: attempt.providerReference,
      checkoutUrl: attempt.checkoutUrl,
    },
  });

  return attempt;
}

type AttendeeSnapshotEntry = {
  ticketClassId?: string;
  attendeeUserId?: string;
  attendeeEmail?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function resolveAttendeeAssignments(
  tx: Prisma.TransactionClient,
  order: {
    attendeeSnapshot: Prisma.JsonValue | null;
    buyerUserId: string;
  },
) {
  if (!Array.isArray(order.attendeeSnapshot)) {
    return new Map<string, string[]>();
  }

  const snapshotEntries: AttendeeSnapshotEntry[] = [];

  for (const value of order.attendeeSnapshot) {
    if (!isRecord(value)) {
      continue;
    }

    const ticketClassIdRaw = value["ticketClassId"];
    const attendeeUserIdRaw = value["attendeeUserId"];
    const attendeeEmailRaw = value["attendeeEmail"];

    snapshotEntries.push({
      ticketClassId:
        typeof ticketClassIdRaw === "string" ? ticketClassIdRaw.trim() : undefined,
      attendeeUserId:
        typeof attendeeUserIdRaw === "string" ? attendeeUserIdRaw.trim() : undefined,
      attendeeEmail:
        typeof attendeeEmailRaw === "string" ? attendeeEmailRaw.trim() : undefined,
    });
  }

  const requestedUserIds = Array.from(
    new Set(
      snapshotEntries
        .map((entry) => entry.attendeeUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const requestedEmails = Array.from(
    new Set(
      snapshotEntries
        .map((entry) => entry.attendeeEmail?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [usersById, usersByEmail] = await Promise.all([
    requestedUserIds.length
      ? tx.user.findMany({
          where: {
            id: {
              in: requestedUserIds,
            },
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
    requestedEmails.length
      ? tx.user.findMany({
          where: {
            email: {
              in: requestedEmails,
            },
          },
          select: {
            id: true,
            email: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const validUserIds = new Set(usersById.map((user) => user.id));
  const validUsersByEmail = new Map(
    usersByEmail.map((user) => [user.email.toLowerCase(), user.id]),
  );
  const assignments = new Map<string, string[]>();

  for (const entry of snapshotEntries) {
    if (!entry.ticketClassId) {
      continue;
    }

    const resolvedUserId =
      (entry.attendeeUserId && validUserIds.has(entry.attendeeUserId)
        ? entry.attendeeUserId
        : undefined) ??
      (entry.attendeeEmail
        ? validUsersByEmail.get(entry.attendeeEmail.toLowerCase())
        : undefined) ??
      order.buyerUserId;

    const queue = assignments.get(entry.ticketClassId) ?? [];
    queue.push(resolvedUserId);
    assignments.set(entry.ticketClassId, queue);
  }

  return assignments;
}

async function markPaymentFailed(
  attemptId: string,
  orderId: string,
  providerEventId: string,
  callbackPayload: Prisma.InputJsonValue,
  failureCode: string,
) {
  await prisma.paymentAttempt.update({
    where: {
      id: attemptId,
    },
    data: {
      status: PaymentAttemptStatus.FAILED,
      failureCode,
      providerEventId,
      callbackPayload,
    },
  });

  const order = await prisma.order.update({
    where: {
      id: orderId,
    },
    data: {
      status: OrderStatus.FAILED,
    },
    select: {
      id: true,
      eventId: true,
      buyerUserId: true,
      event: {
        select: {
          title: true,
        },
      },
    },
  });

  void enqueueSystemNotification({
    eventId: order.eventId,
    userIds: [order.buyerUserId],
    type: NotificationType.PAYMENT_FAILED,
    subject: `Payment failed for ${order.event.title}`,
    content:
      "We could not complete your payment. Retry checkout if your reservation is still active.",
    idempotencyKeyBase: `txn:payment-failed:${attemptId}`,
    metadata: {
      orderId: order.id,
      eventTitle: order.event.title,
      failureCode,
      retryUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue payment failure notification", {
      attemptId,
      orderId,
      error: error instanceof Error ? error.message : "unknown",
    });
  });
}

async function markPaymentProcessing(
  attemptId: string,
  providerEventId: string,
  providerReference: string,
  callbackPayload: Prisma.InputJsonValue,
  status: PaymentAttemptStatus = PaymentAttemptStatus.PROCESSING,
) {
  await prisma.paymentAttempt.update({
    where: {
      id: attemptId,
    },
    data: {
      status,
      providerEventId,
      providerReference,
      callbackPayload,
      failureCode: null,
    },
  });
}

async function markOrderCaptured(
  orderId: string,
  paymentAttemptId: string,
  providerEventId: string,
  providerReference: string | null,
  callbackPayload: Prisma.InputJsonValue,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, orderId);

    const order = await tx.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        event: {
          select: {
            id: true,
            totalCapacity: true,
          },
        },
        reservation: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!order) {
      throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
    }

    if (order.status === OrderStatus.COMPLETED) {
      await tx.paymentAttempt.update({
        where: {
          id: paymentAttemptId,
        },
        data: {
          status: PaymentAttemptStatus.CAPTURED,
          providerEventId,
          providerReference: providerReference ?? undefined,
          callbackPayload,
        },
      });

      return {
        order,
        issuedTickets: [] as string[],
      };
    }

    if (order.reservation.status !== ReservationStatus.PENDING) {
      throw new TicketingDomainError(
        409,
        "INVALID_STATE",
        "Only pending reservations can be confirmed from payment capture.",
      );
    }

    await lockEventRow(tx, order.eventId);
    await lockTicketClassRows(
      tx,
      order.reservation.items.map((item) => item.ticketClassId),
    );

    for (const item of order.reservation.items) {
      const inventoryState = await getTicketClassInventoryState(tx, item.ticketClassId);
      assertInventoryInvariant(inventoryState);

      if (inventoryState.available < item.quantity) {
        throw new TicketingDomainError(
          409,
          "INVENTORY_UNAVAILABLE",
          "Inventory became unavailable before payment capture could finalize.",
        );
      }
    }

    const eventInventory = await getEventInventoryState(
      tx,
      order.eventId,
      order.event.totalCapacity,
    );

    if (eventInventory) {
      assertInventoryInvariant(eventInventory);

      const totalRequestedQuantity = order.reservation.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      if (eventInventory.available < totalRequestedQuantity) {
        throw new TicketingDomainError(
          409,
          "INVENTORY_UNAVAILABLE",
          "Event-level capacity is no longer sufficient for this order.",
        );
      }
    }

    const attendeeAssignments = await resolveAttendeeAssignments(tx, order);

    const issuedTicketIds: string[] = [];

    for (const item of order.reservation.items) {
      const attendeeQueue = attendeeAssignments.get(item.ticketClassId) ?? [];

      for (let index = 0; index < item.quantity; index += 1) {
        const attendeeId = attendeeQueue.shift() ?? order.buyerUserId;

        const ticket = await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ticketClassId: item.ticketClassId,
            orderId: order.id,
            ownerId: order.buyerUserId,
            attendeeId,
            qrToken: crypto.randomUUID(),
            status: TicketStatus.VALID,
            deliveryChannels: {
              email: true,
              inApp: true,
            } as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            issuedAt: true,
          },
        });

        await tx.ticket.update({
          where: {
            id: ticket.id,
          },
          data: {
            qrToken: generateTicketQrToken({
              ticketId: ticket.id,
              buyerId: order.buyerUserId,
              eventId: order.eventId,
              boughtAt: ticket.issuedAt,
            }),
          },
        });

        issuedTicketIds.push(ticket.id);
      }
    }

    const updatedOrder = await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.COMPLETED,
        completedAt: now(),
      },
    });

    await tx.reservation.update({
      where: {
        id: order.reservationId,
      },
      data: {
        status: ReservationStatus.CONFIRMED,
      },
    });

    await tx.paymentAttempt.update({
      where: {
        id: paymentAttemptId,
      },
      data: {
        status: PaymentAttemptStatus.CAPTURED,
        providerEventId,
        providerReference: providerReference ?? undefined,
        callbackPayload,
      },
    });

    return {
      order: updatedOrder,
      issuedTickets: issuedTicketIds,
    };
  }, {
    // Ticket issuance can run longer on remote databases; avoid default interactive tx timeout.
    maxWait: 10_000,
    timeout: 30_000,
  });

  await writeAuditEvent({
    action: "payments.captured",
    scopeType: ScopeType.EVENT,
    scopeId: result.order.eventId,
    targetType: "Order",
    targetId: result.order.id,
    newValue: {
      paymentAttemptId,
      ticketCount: result.issuedTickets.length,
    },
  });

  void enqueueOrderConfirmationNotification(result.order.id).catch((error) => {
    console.warn("Failed to enqueue order confirmation notification", {
      orderId: result.order.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return result;
}

async function processChapaTransactionByReference(
  txRef: string,
  providerEventId: string,
  payload: unknown,
): Promise<ChapaTransactionProcessResult> {
  const normalizedProviderEventId = normalizeProviderEventId(providerEventId) ?? txRef;

  const existingAttemptByEventId = await prisma.paymentAttempt.findFirst({
    where: {
      provider: "CHAPA",
      providerEventId: normalizedProviderEventId,
    },
  });

  const attempt =
    existingAttemptByEventId ??
    (await prisma.paymentAttempt.findFirst({
      where: {
        provider: "CHAPA",
        providerReference: txRef,
      },
    }));

  if (!attempt) {
    throw new TicketingDomainError(
      404,
      "RESERVATION_NOT_FOUND",
      "Payment attempt not found for tx_ref.",
    );
  }

  if (
    existingAttemptByEventId &&
    isTerminalPaymentAttemptStatus(existingAttemptByEventId.status)
  ) {
    return {
      idempotent: true,
      paymentAttemptId: existingAttemptByEventId.id,
      orderId: existingAttemptByEventId.orderId,
      status: existingAttemptByEventId.status,
    };
  }

  const persistedTraceContext = extractTraceContextFromMetadata(attempt.metadata);

  const processAttempt = async () => {
    try {
      const verified = await verifyChapaPayment(txRef);

      if (verified.status !== "success" || !verified.data) {
        await markPaymentProcessing(
          attempt.id,
          normalizedProviderEventId,
          txRef,
          payload as Prisma.InputJsonValue,
        );

        return {
          idempotent: false,
          paymentAttemptId: attempt.id,
          orderId: attempt.orderId,
          status: PaymentAttemptStatus.PROCESSING,
        };
      }

      const status = (verified.data.status ?? "").toUpperCase();

      const verifiedAmount = Number(verified.data.amount);
      const expectedAmount = toCurrencyAmount(attempt.amount);
      const amountMatches =
        Number.isFinite(verifiedAmount) &&
        Math.abs(verifiedAmount - expectedAmount) < 0.01;
      const currencyMatches =
        (verified.data.currency ?? "").toUpperCase() ===
        orderCurrencyUpper(attempt.currency);

      if (!amountMatches || !currencyMatches) {
        await markPaymentFailed(
          attempt.id,
          attempt.orderId,
          normalizedProviderEventId,
          payload as Prisma.InputJsonValue,
          "AMOUNT_OR_CURRENCY_MISMATCH",
        );

        return {
          idempotent: false,
          paymentAttemptId: attempt.id,
          orderId: attempt.orderId,
          status: PaymentAttemptStatus.FAILED,
        };
      }

      if (isSuccessfulPaymentStatus(status)) {
        await markOrderCaptured(
          attempt.orderId,
          attempt.id,
          normalizedProviderEventId,
          txRef,
          payload as Prisma.InputJsonValue,
        );

        return {
          idempotent: false,
          paymentAttemptId: attempt.id,
          orderId: attempt.orderId,
          status: PaymentAttemptStatus.CAPTURED,
        };
      }

      if (isFailedPaymentStatus(status)) {
        await markPaymentFailed(
          attempt.id,
          attempt.orderId,
          normalizedProviderEventId,
          payload as Prisma.InputJsonValue,
          `CHAPA_STATUS_${status || "UNKNOWN"}`,
        );

        return {
          idempotent: false,
          paymentAttemptId: attempt.id,
          orderId: attempt.orderId,
          status: PaymentAttemptStatus.FAILED,
        };
      }

      const processingStatus = isPendingPaymentStatus(status)
        ? PaymentAttemptStatus.PROCESSING
        : PaymentAttemptStatus.REQUIRES_ACTION;

      await markPaymentProcessing(
        attempt.id,
        normalizedProviderEventId,
        txRef,
        payload as Prisma.InputJsonValue,
        processingStatus,
      );

      return {
        idempotent: false,
        paymentAttemptId: attempt.id,
        orderId: attempt.orderId,
        status: processingStatus,
      };
    } catch {
      await markPaymentProcessing(
        attempt.id,
        normalizedProviderEventId,
        txRef,
        payload as Prisma.InputJsonValue,
      );

      return {
        idempotent: false,
        paymentAttemptId: attempt.id,
        orderId: attempt.orderId,
        status: PaymentAttemptStatus.PROCESSING,
      };
    }
  };

  if (persistedTraceContext) {
    return withObservabilityContext(persistedTraceContext, processAttempt);
  }

  return processAttempt();
}

export async function processChapaWebhook(
  signature: string | null,
  payload: unknown,
  options?: {
    skipSignatureVerification?: boolean;
    rawBody?: string;
  },
) {
  const rawBody = options?.rawBody ?? JSON.stringify(payload ?? {});

  if (!options?.skipSignatureVerification) {
    assertWebhookSignature(signature, rawBody);
  }

  const callbackInput = toChapaCallbackInput(payload);

  return processChapaTransactionByReference(
    callbackInput.txRef,
    callbackInput.providerEventId ?? callbackInput.txRef,
    payload,
  );
}

export async function processChapaCallback(payload: unknown) {
  const callbackInput = toChapaCallbackInput(payload);

  return processChapaTransactionByReference(
    callbackInput.txRef,
    callbackInput.providerEventId ?? callbackInput.txRef,
    payload,
  );
}

export async function retryOrderPayment(
  eventId: string,
  orderId: string,
  input: RetryPaymentInput,
) {
  const parsedInput = parseRetryPaymentInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "payments.retry");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      eventId,
      buyerUserId: authz.session.user.id,
    },
    include: {
      reservation: true,
    },
  });

  if (!order) {
    throw new TicketingDomainError(404, "RESERVATION_NOT_FOUND", "Order not found.");
  }

  if (order.status !== OrderStatus.FAILED && order.status !== OrderStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Order retry is allowed only for FAILED or PENDING orders.",
    );
  }

  if (order.reservation.status !== ReservationStatus.PENDING) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Reservation is not active for payment retry.",
    );
  }

  if (order.reservation.expiresAt.getTime() <= Date.now()) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Reservation has expired; create a new reservation before retrying payment.",
    );
  }

  if (order.status === OrderStatus.FAILED) {
    await prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.PENDING,
      },
    });
  }

  return initializeOrderPayment(eventId, orderId, {
    idempotencyKey: parsedInput.idempotencyKey,
    returnUrl: parsedInput.returnUrl,
  });
}

export async function requestTicketTransfer(
  eventId: string,
  ticketId: string,
  input: TicketTransferRequestInput,
) {
  const parsedInput = parseTicketTransferRequestInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticket.transfer.request");

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      eventId,
      ownerId: authz.session.user.id,
    },
    select: {
      id: true,
      ownerId: true,
      status: true,
      event: {
        select: {
          title: true,
        },
      },
      ticketClass: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new TicketingDomainError(404, "TICKET_NOT_FOUND", "Ticket not found.");
  }

  if (ticket.status !== TicketStatus.VALID) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Only VALID tickets can be transferred.",
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      email: parsedInput.toUserEmail,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new TicketingDomainError(
      404,
      "UNPROCESSABLE_TICKETING",
      "Transfer target user does not exist.",
    );
  }

  if (targetUser.id === authz.session.user.id) {
    throw new TicketingDomainError(
      422,
      "UNPROCESSABLE_TICKETING",
      "Ticket transfer target must be a different user.",
    );
  }

  const existingPending = await prisma.ticketTransfer.findFirst({
    where: {
      ticketId,
      status: TicketTransferStatus.PENDING,
      expiresAt: {
        gt: now(),
      },
    },
  });

  if (existingPending) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "A pending transfer already exists for this ticket.",
    );
  }

  const transfer = await prisma.ticketTransfer.create({
    data: {
      ticketId,
      fromUserId: authz.session.user.id,
      toUserId: targetUser.id,
      status: TicketTransferStatus.PENDING,
      expiresAt: getTransferExpiry(parsedInput.expiresInHours),
      responseReason: parsedInput.reason,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "ticket.transfer.requested",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "TicketTransfer",
    targetId: transfer.id,
    reason: parsedInput.reason,
    newValue: {
      ticketId,
      toUserId: targetUser.id,
      expiresAt: transfer.expiresAt.toISOString(),
    },
  });

  void enqueueSystemNotification({
    eventId,
    userIds: [targetUser.id],
    type: NotificationType.TICKET_TRANSFER_REQUESTED,
    subject: `Ticket transfer request for ${ticket.event.title}`,
    content:
      "A ticket has been offered to you. Review and respond before the transfer expires.",
    idempotencyKeyBase: `txn:transfer-requested:${transfer.id}`,
    metadata: {
      transferId: transfer.id,
      eventTitle: ticket.event.title,
      ticketLabel: ticket.ticketClass.name,
      fromUserName: authz.session.user.name,
      expiresAt: transfer.expiresAt.toISOString(),
      actionUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue transfer request notification", {
      transferId: transfer.id,
      eventId,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return transfer;
}

export async function respondToTicketTransfer(
  eventId: string,
  transferId: string,
  input: TicketTransferResponseInput,
) {
  const parsedInput = parseTicketTransferResponseInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticket.transfer.respond");

  const transfer = await prisma.ticketTransfer.findUnique({
    where: {
      id: transferId,
    },
    include: {
      fromUser: {
        select: {
          id: true,
          name: true,
        },
      },
      toUser: {
        select: {
          id: true,
          name: true,
        },
      },
      ticket: {
        select: {
          id: true,
          eventId: true,
          status: true,
          qrToken: true,
          event: {
            select: {
              title: true,
            },
          },
          ticketClass: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!transfer || transfer.ticket.eventId !== eventId) {
    throw new TicketingDomainError(404, "TRANSFER_NOT_FOUND", "Transfer not found.");
  }

  if (transfer.toUserId !== authz.session.user.id) {
    throw new TicketingDomainError(403, "INVALID_STATE", "Transfer is not assigned to you.");
  }

  if (transfer.ticket.status !== TicketStatus.VALID) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Only VALID tickets can complete transfer responses.",
    );
  }

  assertTransferPending(transfer);

  const updatedTransfer = await prisma.$transaction(async (tx) => {
    const status =
      parsedInput.action === "ACCEPT"
        ? TicketTransferStatus.ACCEPTED
        : TicketTransferStatus.REJECTED;

    const nextTransfer = await tx.ticketTransfer.update({
      where: {
        id: transfer.id,
      },
      data: {
        status,
        respondedAt: now(),
        responseReason: parsedInput.reason,
      },
    });

    if (status === TicketTransferStatus.ACCEPTED) {
      await tx.ticket.update({
        where: {
          id: transfer.ticketId,
        },
        data: {
          ownerId: authz.session.user.id,
          attendeeId: authz.session.user.id,
        },
      });
    }

    return nextTransfer;
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: `ticket.transfer.${parsedInput.action.toLowerCase()}`,
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "TicketTransfer",
    targetId: transfer.id,
    reason: parsedInput.reason,
  });

  void enqueueSystemNotification({
    eventId,
    userIds: [transfer.fromUserId],
    type: NotificationType.TICKET_TRANSFER_UPDATED,
    subject: `Transfer update for ${transfer.ticket.event.title}`,
    content: "A transfer response has been recorded for your ticket.",
    idempotencyKeyBase: `txn:transfer-updated:${updatedTransfer.id}:${updatedTransfer.status}`,
    metadata: {
      transferId: updatedTransfer.id,
      eventTitle: transfer.ticket.event.title,
      ticketLabel: transfer.ticket.ticketClass.name,
      transferStatus: updatedTransfer.status,
      toUserName: transfer.toUser.name,
      reason: parsedInput.reason,
      manageUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue transfer sender update notification", {
      transferId: updatedTransfer.id,
      eventId,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  if (updatedTransfer.status === TicketTransferStatus.ACCEPTED) {
    void enqueueSystemNotification({
      eventId,
      userIds: [transfer.toUserId],
      type: NotificationType.TICKET_TRANSFER_RECEIVED,
      subject: `You received a ticket for ${transfer.ticket.event.title}`,
      content: "Ticket ownership has been transferred to your account.",
      idempotencyKeyBase: `txn:transfer-received:${updatedTransfer.id}`,
      metadata: {
        transferId: updatedTransfer.id,
        eventTitle: transfer.ticket.event.title,
        ticketLabel: transfer.ticket.ticketClass.name,
        fromUserName: transfer.fromUser.name,
        qrToken: transfer.ticket.qrToken,
        manageUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
      },
      maxAttempts: 6,
    }).catch((error) => {
      console.warn("Failed to enqueue transfer recipient notification", {
        transferId: updatedTransfer.id,
        eventId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return updatedTransfer;
}

export async function cancelTicket(
  eventId: string,
  ticketId: string,
  input: TicketCancellationInput,
) {
  const parsedInput = parseTicketCancellationInput(input);
  const authz = await requireTicketingSelfServicePermission(eventId, "ticket.cancel");

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      eventId,
      OR: [{ ownerId: authz.session.user.id }, { attendeeId: authz.session.user.id }],
    },
    select: {
      id: true,
      status: true,
      event: {
        select: {
          startAt: true,
          status: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new TicketingDomainError(404, "TICKET_NOT_FOUND", "Ticket not found.");
  }

  assertTicketCancelable(ticket);

  if (
    ticket.event.status === EventStatus.LIVE ||
    ticket.event.status === EventStatus.COMPLETED ||
    ticket.event.status === EventStatus.ARCHIVED ||
    ticket.event.startAt.getTime() <= Date.now()
  ) {
    throw new TicketingDomainError(
      409,
      "INVALID_STATE",
      "Ticket cancellation is not allowed after event start.",
    );
  }

  const updated = await prisma.ticket.update({
    where: {
      id: ticket.id,
    },
    data: {
      status: TicketStatus.CANCELLED,
      cancelledAt: now(),
      cancellationReason: parsedInput.reason,
    },
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "ticket.cancelled",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Ticket",
    targetId: ticket.id,
    reason: parsedInput.reason,
  });

  return updated;
}

export async function reconcilePendingPayments(
  limit = 100,
): Promise<PaymentReconciliationResult> {
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: "CHAPA",
      status: {
        in: [
          PaymentAttemptStatus.INITIATED,
          PaymentAttemptStatus.PROCESSING,
          PaymentAttemptStatus.REQUIRES_ACTION,
          PaymentAttemptStatus.AUTHORIZED,
        ],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  });

  let captured = 0;
  let failed = 0;
  let unresolved = 0;

  for (const attempt of attempts) {
    if (!attempt.providerReference) {
      unresolved += 1;
      continue;
    }

    try {
      const verified = await verifyChapaPayment(attempt.providerReference);

      if (verified.status !== "success" || !verified.data) {
        await markPaymentProcessing(
          attempt.id,
          attempt.providerReference,
          attempt.providerReference,
          {
            reconciliation: true,
            reason: "verification_failed",
          },
        );
        unresolved += 1;
        continue;
      }

      const status = (verified.data.status ?? "").toUpperCase();
      const verifiedAmount = Number(verified.data.amount);
      const expectedAmount = toCurrencyAmount(attempt.amount);
      const amountMatches =
        Number.isFinite(verifiedAmount) &&
        Math.abs(verifiedAmount - expectedAmount) < 0.01;
      const currencyMatches =
        orderCurrencyUpper(verified.data.currency ?? "") ===
        orderCurrencyUpper(attempt.currency);

      if (!amountMatches || !currencyMatches) {
        await markPaymentFailed(
          attempt.id,
          attempt.orderId,
          verified.data.tx_ref,
          {
            reconciliation: true,
            reason: "amount_or_currency_mismatch",
          },
          "RECONCILIATION_AMOUNT_OR_CURRENCY_MISMATCH",
        );
        failed += 1;
        continue;
      }

      if (isFailedPaymentStatus(status)) {
        await markPaymentFailed(
          attempt.id,
          attempt.orderId,
          verified.data.tx_ref,
          {
            reconciliation: true,
            reason: "failed_provider_status",
            status,
          },
          `RECONCILIATION_CHAPA_STATUS_${status || "UNKNOWN"}`,
        );
        failed += 1;
        continue;
      }

      if (!isSuccessfulPaymentStatus(status)) {
        const nonTerminalStatus = isPendingPaymentStatus(status)
          ? PaymentAttemptStatus.PROCESSING
          : PaymentAttemptStatus.REQUIRES_ACTION;

        await markPaymentProcessing(
          attempt.id,
          verified.data.tx_ref,
          attempt.providerReference,
          {
            reconciliation: true,
            reason: "non_terminal_provider_status",
            status,
          },
          nonTerminalStatus,
        );

        unresolved += 1;
        continue;
      }

      await markOrderCaptured(
        attempt.orderId,
        attempt.id,
        verified.data.tx_ref,
        attempt.providerReference,
        {
          reconciliation: true,
          providerReference: attempt.providerReference,
          status,
        },
      );

      captured += 1;
    } catch {
      unresolved += 1;
    }
  }

  return {
    checked: attempts.length,
    captured,
    failed,
    unresolved,
  };
}

async function cancelExpiredChapaTransactions(eventId?: string) {
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: "CHAPA",
      providerReference: {
        not: null,
      },
      status: {
        in: [
          PaymentAttemptStatus.INITIATED,
          PaymentAttemptStatus.PROCESSING,
          PaymentAttemptStatus.REQUIRES_ACTION,
          PaymentAttemptStatus.AUTHORIZED,
        ],
      },
      order: {
        eventId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.FAILED],
        },
        reservation: {
          status: ReservationStatus.EXPIRED,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 100,
  });

  let cancelled = 0;

  for (const attempt of attempts) {
    if (!attempt.providerReference) {
      continue;
    }

    try {
      const cancellation = await cancelChapaTransaction(attempt.providerReference);

      if (cancellation.status !== "success") {
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.update({
          where: {
            id: attempt.id,
          },
          data: {
            status: PaymentAttemptStatus.VOIDED,
            failureCode: "EXPIRED_RESERVATION_CANCELLED",
            callbackPayload: {
              source: "maintenance",
              cancellation,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.order.update({
          where: {
            id: attempt.orderId,
          },
          data: {
            status: OrderStatus.FAILED,
          },
        });
      });

      cancelled += 1;
    } catch {
      continue;
    }
  }

  return cancelled;
}

export async function runTicketingMaintenance(eventId?: string): Promise<TicketingMaintenanceResult> {
  const [expiredReservations, expiredTransfers, expiredWaitlistClaims] = await prisma.$transaction(async (tx) => {
    const expiredReservationsCount = await expireReservationsTx(tx, eventId);

    const expiredTransfersUpdate = await tx.ticketTransfer.updateMany({
      where: {
        status: TicketTransferStatus.PENDING,
        expiresAt: {
          lte: now(),
        },
        ...(eventId
          ? {
              ticket: {
                eventId,
              },
            }
          : {}),
      },
      data: {
        status: TicketTransferStatus.EXPIRED,
        respondedAt: now(),
      },
    });

    const expiredWaitlistClaimsUpdate = await tx.waitlistEntry.updateMany({
      where: {
        status: WaitlistStatus.NOTIFIED,
        claimExpiresAt: {
          lte: now(),
        },
        ...(eventId
          ? {
              eventId,
            }
          : {}),
      },
      data: {
        status: WaitlistStatus.EXPIRED,
      },
    });

    return [
      expiredReservationsCount,
      expiredTransfersUpdate.count,
      expiredWaitlistClaimsUpdate.count,
    ];
  });

  let promotedWaitlistEntries = 0;
  let reconciledPaymentAttempts = 0;
  const cancelledProviderTransactions = await cancelExpiredChapaTransactions(eventId);
  const rotatedLegacyQrTokens = await rotateLegacyTicketQrTokens(eventId);

  if (eventId) {
    const promoted = await promoteWaitlist(eventId);
    promotedWaitlistEntries = promoted.promoted;
  } else {
    const reconciliation = await reconcilePendingPayments();
    reconciledPaymentAttempts = reconciliation.checked;
  }

  return {
    expiredReservations,
    promotedWaitlistEntries,
    expiredTransfers,
    expiredWaitlistClaims,
    reconciledPaymentAttempts,
    rotatedLegacyQrTokens,
    cancelledProviderTransactions,
  };
}
