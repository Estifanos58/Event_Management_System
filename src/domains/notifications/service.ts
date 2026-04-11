import crypto from "node:crypto";
import {
  CheckInStatus,
  EventStatus,
  NotificationAttemptStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  Prisma,
  ScopeType,
  TicketStatus,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { getServerSessionOrNull } from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { dispatchNotificationChannel } from "@/domains/notifications/adapters";
import { NotificationDomainError } from "@/domains/notifications/errors";
import type {
  EnqueueNotificationResult,
  EnqueueSystemNotificationInput,
  EnqueueTransactionalNotificationInput,
  ListEventNotificationDeliveriesQuery,
  ListMyNotificationsQuery,
  NotificationAudienceType,
  NotificationDeliveryListItem,
  NotificationPreferencesSnapshot,
  NotificationsMaintenanceResult,
  SendOrganizerAnnouncementInput,
  UpdateMyNotificationPreferencesInput,
} from "@/domains/notifications/types";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";

const DELIVERY_BATCH_SIZE = 100;
const MAX_DELIVERY_ATTEMPTS = 12;

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: true,
  inAppEnabled: true,
  emailConsent: true,
  smsConsent: false,
  pushConsent: true,
  marketingOptIn: false,
} as const;

const CHANNEL_DEFAULTS_BY_TYPE: Record<NotificationType, NotificationChannel[]> = {
  [NotificationType.ORDER_CONFIRMATION]: [
    NotificationChannel.EMAIL,
  ],
  [NotificationType.EVENT_REMINDER]: [
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
  ],
  [NotificationType.EVENT_UPDATE]: [
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
    NotificationChannel.PUSH,
  ],
  [NotificationType.ORGANIZER_ANNOUNCEMENT]: [
    NotificationChannel.EMAIL,
    NotificationChannel.IN_APP,
  ],
  [NotificationType.WELCOME]: [NotificationChannel.EMAIL],
  [NotificationType.ORGANIZATION_CREATED]: [NotificationChannel.EMAIL],
  [NotificationType.TICKET_TRANSFER_REQUESTED]: [NotificationChannel.EMAIL],
  [NotificationType.TICKET_TRANSFER_UPDATED]: [NotificationChannel.EMAIL],
  [NotificationType.TICKET_TRANSFER_RECEIVED]: [NotificationChannel.EMAIL],
  [NotificationType.REFUND_COMPLETED]: [NotificationChannel.EMAIL],
  [NotificationType.USER_RESTRICTED]: [NotificationChannel.EMAIL],
  [NotificationType.STAFF_ASSIGNED]: [NotificationChannel.EMAIL],
  [NotificationType.CHECKIN_ACCEPTED]: [NotificationChannel.EMAIL],
  [NotificationType.WAITLIST_PROMOTED]: [NotificationChannel.EMAIL],
  [NotificationType.PAYMENT_FAILED]: [NotificationChannel.EMAIL],
  [NotificationType.EVENT_STATUS_CHANGED]: [NotificationChannel.EMAIL],
};

const organizerAnnouncementAudienceSchema = z.enum([
  "ALL_ATTENDEES",
  "CHECKED_IN_ATTENDEES",
  "NOT_CHECKED_IN_ATTENDEES",
  "TICKET_CLASS_BUYERS",
]);

const updateMyNotificationPreferencesInputSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    emailConsent: z.boolean().optional(),
    smsConsent: z.boolean().optional(),
    pushConsent: z.boolean().optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

const enqueueTransactionalNotificationInputSchema = z.object({
  type: z.enum(NotificationType),
  userId: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(240).optional(),
  content: z.string().trim().min(1).max(8_000),
  channels: z.array(z.enum(NotificationChannel)).min(1).max(4).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.unknown().optional(),
  maxAttempts: z.coerce.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS).optional(),
});

const enqueueSystemNotificationInputSchema = z.object({
  orgId: z.string().trim().min(1).max(120).optional(),
  eventId: z.string().trim().min(1).max(120).optional(),
  userIds: z.array(z.string().trim().min(1).max(120)).min(1).max(20_000),
  type: z.enum(NotificationType),
  subject: z.string().trim().max(240).optional(),
  content: z.string().trim().min(1).max(8_000),
  channels: z.array(z.enum(NotificationChannel)).min(1).max(4).optional(),
  idempotencyKeyBase: z.string().trim().min(8).max(200),
  metadata: z.unknown().optional(),
  scheduledFor: z.union([z.string().datetime(), z.date()]).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(MAX_DELIVERY_ATTEMPTS).optional(),
  createdBy: z.string().trim().min(1).max(120).optional(),
});

const sendOrganizerAnnouncementInputSchema = z
  .object({
    subject: z.string().trim().max(240).optional(),
    content: z.string().trim().min(1).max(8_000),
    channels: z.array(z.enum(NotificationChannel)).min(1).max(4).optional(),
    audienceType: organizerAnnouncementAudienceSchema,
    ticketClassId: z.string().trim().max(120).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    scheduledFor: z.string().datetime().optional(),
    metadata: z.unknown().optional(),
  })
  .refine(
    (payload) =>
      payload.audienceType !== "TICKET_CLASS_BUYERS" || Boolean(payload.ticketClassId?.trim()),
    {
      message: "ticketClassId is required for TICKET_CLASS_BUYERS audience type.",
      path: ["ticketClassId"],
    },
  );

const listEventNotificationDeliveriesQuerySchema = z.object({
  type: z.enum(NotificationType).optional(),
  channel: z.enum(NotificationChannel).optional(),
  status: z.enum(NotificationDeliveryStatus).optional(),
  userId: z.string().trim().max(120).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const listMyNotificationsQuerySchema = z.object({
  status: z.enum(NotificationDeliveryStatus).optional(),
  type: z.enum(NotificationType).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

function now() {
  return new Date();
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function dedupeChannels(channels: NotificationChannel[]) {
  return Array.from(new Set(channels));
}

function getRetryDelayMs(attemptCount: number) {
  const baseSeconds = 45;
  const exponent = Math.max(0, attemptCount - 1);
  const delaySeconds = Math.min(3_600, baseSeconds * 2 ** exponent);
  return delaySeconds * 1_000;
}

function toNotificationPreferencesSnapshot(input: {
  userId: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  emailConsent?: boolean;
  smsConsent?: boolean;
  pushConsent?: boolean;
  marketingOptIn?: boolean;
  updatedAt?: Date;
}): NotificationPreferencesSnapshot {
  return {
    userId: input.userId,
    emailEnabled: input.emailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
    smsEnabled: input.smsEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.smsEnabled,
    pushEnabled: input.pushEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.pushEnabled,
    inAppEnabled: input.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled,
    emailConsent: input.emailConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.emailConsent,
    smsConsent: input.smsConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.smsConsent,
    pushConsent: input.pushConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.pushConsent,
    marketingOptIn:
      input.marketingOptIn ?? DEFAULT_NOTIFICATION_PREFERENCES.marketingOptIn,
    updatedAt: (input.updatedAt ?? now()).toISOString(),
  };
}

function toNotificationDeliveryListItem(delivery: {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  subject: string | null;
  content: string;
  recipientAddress: string | null;
  scheduledFor: Date;
  nextAttemptAt: Date;
  attemptCount: number;
  maxAttempts: number;
  failureReason: string | null;
  sentAt: Date | null;
  failedAt: Date | null;
  eventId: string | null;
  userId: string;
  createdAt: Date;
}): NotificationDeliveryListItem {
  return {
    id: delivery.id,
    type: delivery.type,
    channel: delivery.channel,
    status: delivery.status,
    subject: delivery.subject ?? undefined,
    content: delivery.content,
    recipientAddress: delivery.recipientAddress ?? undefined,
    scheduledFor: delivery.scheduledFor.toISOString(),
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    attemptCount: delivery.attemptCount,
    maxAttempts: delivery.maxAttempts,
    failureReason: delivery.failureReason ?? undefined,
    sentAt: delivery.sentAt?.toISOString(),
    failedAt: delivery.failedAt?.toISOString(),
    eventId: delivery.eventId ?? undefined,
    userId: delivery.userId,
    createdAt: delivery.createdAt.toISOString(),
  };
}

function parseUpdateMyNotificationPreferencesInput(
  input: UpdateMyNotificationPreferencesInput,
) {
  return updateMyNotificationPreferencesInputSchema.parse(input);
}

function parseEnqueueTransactionalNotificationInput(
  input: EnqueueTransactionalNotificationInput,
) {
  const parsed = enqueueTransactionalNotificationInputSchema.parse(input);

  return {
    type: parsed.type,
    userId: parsed.userId,
    subject: normalizeOptionalText(parsed.subject),
    content: parsed.content,
    channels: parsed.channels ? dedupeChannels(parsed.channels) : undefined,
    idempotencyKey: normalizeOptionalText(parsed.idempotencyKey),
    scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : undefined,
    metadata: parsed.metadata,
    maxAttempts: parsed.maxAttempts ?? 6,
  };
}

function parseEnqueueSystemNotificationInput(input: EnqueueSystemNotificationInput) {
  const parsed = enqueueSystemNotificationInputSchema.parse(input);

  return {
    orgId: normalizeOptionalText(parsed.orgId),
    eventId: normalizeOptionalText(parsed.eventId),
    userIds: Array.from(new Set(parsed.userIds)),
    type: parsed.type,
    subject: normalizeOptionalText(parsed.subject),
    content: parsed.content,
    channels: parsed.channels ? dedupeChannels(parsed.channels) : undefined,
    idempotencyKeyBase: parsed.idempotencyKeyBase,
    metadata: parsed.metadata,
    scheduledFor:
      typeof parsed.scheduledFor === "string"
        ? new Date(parsed.scheduledFor)
        : parsed.scheduledFor,
    maxAttempts: parsed.maxAttempts,
    createdBy: normalizeOptionalText(parsed.createdBy),
  };
}

function parseSendOrganizerAnnouncementInput(input: SendOrganizerAnnouncementInput) {
  const parsed = sendOrganizerAnnouncementInputSchema.parse(input);

  return {
    subject: normalizeOptionalText(parsed.subject),
    content: parsed.content,
    channels: parsed.channels ? dedupeChannels(parsed.channels) : undefined,
    audienceType: parsed.audienceType as NotificationAudienceType,
    ticketClassId: normalizeOptionalText(parsed.ticketClassId),
    idempotencyKey: normalizeOptionalText(parsed.idempotencyKey),
    scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : undefined,
    metadata: parsed.metadata,
  };
}

function parseListEventNotificationDeliveriesQuery(input: ListEventNotificationDeliveriesQuery) {
  const parsed = listEventNotificationDeliveriesQuerySchema.parse(input);

  return {
    type: parsed.type,
    channel: parsed.channel,
    status: parsed.status,
    userId: normalizeOptionalText(parsed.userId),
    take: parsed.take ?? 100,
  };
}

function parseListMyNotificationsQuery(input: ListMyNotificationsQuery) {
  const parsed = listMyNotificationsQuerySchema.parse(input);

  return {
    status: parsed.status,
    type: parsed.type,
    take: parsed.take ?? 100,
  };
}

async function requireAuthenticatedSession() {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new NotificationDomainError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  return session;
}

async function requireNotificationReadPermission(eventId: string, action: string) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.read",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function requireNotificationManagePermission(eventId: string, action: string) {
  return requirePermission({
    context: createAccessContext(ScopeType.EVENT, eventId),
    permission: "event.manage",
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

async function loadEventNotificationContext(eventId: string) {
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
      timezone: true,
      reminderLeadHours: true,
      reminderEmailTemplate: true,
      organizerAnnouncementTemplate: true,
    },
  });

  if (!event) {
    throw new NotificationDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  return event;
}

async function resolveAudienceUserIds(
  eventId: string,
  audienceType: NotificationAudienceType,
  ticketClassId?: string,
) {
  if (audienceType === "ALL_ATTENDEES") {
    const attendees = await prisma.ticket.findMany({
      where: {
        eventId,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      distinct: ["attendeeId"],
      select: {
        attendeeId: true,
      },
    });

    return attendees.map((entry) => entry.attendeeId);
  }

  if (audienceType === "CHECKED_IN_ATTENDEES") {
    const checkedIn = await prisma.checkInEvent.findMany({
      where: {
        eventId,
        status: CheckInStatus.ACCEPTED,
      },
      distinct: ["ticketId"],
      select: {
        ticket: {
          select: {
            attendeeId: true,
          },
        },
      },
    });

    return Array.from(new Set(checkedIn.map((entry) => entry.ticket.attendeeId)));
  }

  if (audienceType === "NOT_CHECKED_IN_ATTENDEES") {
    const [allAttendees, checkedIn] = await Promise.all([
      prisma.ticket.findMany({
        where: {
          eventId,
          status: {
            in: [TicketStatus.VALID, TicketStatus.USED],
          },
        },
        distinct: ["attendeeId"],
        select: {
          attendeeId: true,
        },
      }),
      prisma.checkInEvent.findMany({
        where: {
          eventId,
          status: CheckInStatus.ACCEPTED,
        },
        distinct: ["ticketId"],
        select: {
          ticket: {
            select: {
              attendeeId: true,
            },
          },
        },
      }),
    ]);

    const checkedInSet = new Set(
      checkedIn.map((entry) => entry.ticket.attendeeId),
    );

    return allAttendees
      .map((entry) => entry.attendeeId)
      .filter((attendeeId) => !checkedInSet.has(attendeeId));
  }

  const buyers = await prisma.ticket.findMany({
    where: {
      eventId,
      ticketClassId,
      status: {
        in: [TicketStatus.VALID, TicketStatus.USED],
      },
    },
    distinct: ["attendeeId"],
    select: {
      attendeeId: true,
    },
  });

  return buyers.map((entry) => entry.attendeeId);
}

function isChannelAllowedByPreference(
  type: NotificationType,
  channel: NotificationChannel,
  preference: NotificationPreferencesSnapshot,
): { allowed: boolean; reason?: string } {
  if (channel === NotificationChannel.EMAIL) {
    if (!preference.emailEnabled) {
      return {
        allowed: false,
        reason: "email_disabled_by_preference",
      };
    }

    if (!preference.emailConsent) {
      return {
        allowed: false,
        reason: "email_consent_not_granted",
      };
    }
  }

  if (channel === NotificationChannel.SMS) {
    if (!preference.smsEnabled) {
      return {
        allowed: false,
        reason: "sms_disabled_by_preference",
      };
    }

    if (!preference.smsConsent) {
      return {
        allowed: false,
        reason: "sms_consent_not_granted",
      };
    }
  }

  if (channel === NotificationChannel.PUSH) {
    if (!preference.pushEnabled) {
      return {
        allowed: false,
        reason: "push_disabled_by_preference",
      };
    }

    if (!preference.pushConsent) {
      return {
        allowed: false,
        reason: "push_consent_not_granted",
      };
    }
  }

  if (channel === NotificationChannel.IN_APP && !preference.inAppEnabled) {
    return {
      allowed: false,
      reason: "in_app_disabled_by_preference",
    };
  }

  if (
    type === NotificationType.ORGANIZER_ANNOUNCEMENT &&
    channel !== NotificationChannel.IN_APP &&
    !preference.marketingOptIn
  ) {
    return {
      allowed: false,
      reason: "marketing_opt_in_required",
    };
  }

  return {
    allowed: true,
  };
}

async function createNotificationDeliveries(input: {
  orgId?: string;
  eventId?: string;
  userIds: string[];
  type: NotificationType;
  subject?: string;
  content: string;
  channels: NotificationChannel[];
  idempotencyKeyBase: string;
  metadata?: unknown;
  scheduledFor?: Date;
  maxAttempts?: number;
  createdBy?: string;
}): Promise<EnqueueNotificationResult> {
  const uniqueUserIds = Array.from(new Set(input.userIds));

  if (!uniqueUserIds.length) {
    return {
      created: 0,
      deduped: 0,
    };
  }

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: uniqueUserIds,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  const userById = new Map(users.map((user) => [user.id, user]));

  let created = 0;
  let deduped = 0;

  for (const userId of uniqueUserIds) {
    const user = userById.get(userId);

    if (!user) {
      continue;
    }

    for (const channel of input.channels) {
      const idempotencyKey = `${input.idempotencyKeyBase}:${userId}:${channel}`;

      try {
        await prisma.notificationDelivery.create({
          data: {
            orgId: input.orgId,
            eventId: input.eventId,
            userId,
            type: input.type,
            channel,
            subject: input.subject,
            content: input.content,
            recipientAddress:
              channel === NotificationChannel.EMAIL ? user.email : undefined,
            metadata: toJsonValue(input.metadata),
            scheduledFor: input.scheduledFor ?? now(),
            nextAttemptAt: input.scheduledFor ?? now(),
            maxAttempts: input.maxAttempts ?? 6,
            idempotencyKey,
            createdBy: input.createdBy,
          },
        });

        created += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          deduped += 1;
          continue;
        }

        throw error;
      }
    }
  }

  return {
    created,
    deduped,
  };
}

function renderReminderMessage(input: {
  eventTitle: string;
  startAt: Date;
  timezone: string;
  template?: string | null;
}) {
  const startAtIso = input.startAt.toISOString();
  const baseMessage = `Reminder: ${input.eventTitle} starts at ${startAtIso} (${input.timezone}).`;

  if (!input.template) {
    return baseMessage;
  }

  return input.template
    .replaceAll("{{eventTitle}}", input.eventTitle)
    .replaceAll("{{startAt}}", startAtIso)
    .replaceAll("{{timezone}}", input.timezone)
    .replaceAll("{{message}}", baseMessage);
}

async function queueEventReminderNotifications(eventId?: string) {
  const dueEvents = await prisma.event.findMany({
    where: {
      ...(eventId
        ? {
            id: eventId,
          }
        : {}),
      status: {
        in: [EventStatus.PUBLISHED, EventStatus.LIVE],
      },
      startAt: {
        gt: now(),
      },
      reminderLeadHours: {
        not: null,
      },
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      startAt: true,
      timezone: true,
      reminderLeadHours: true,
      reminderEmailTemplate: true,
    },
    take: eventId ? 1 : 100,
  });

  let queued = 0;

  for (const event of dueEvents) {
    const leadHours = event.reminderLeadHours ?? 24;
    const msUntilStart = event.startAt.getTime() - Date.now();
    const leadWindowMs = leadHours * 60 * 60 * 1000;

    if (msUntilStart > leadWindowMs) {
      continue;
    }

    const attendees = await prisma.ticket.findMany({
      where: {
        eventId: event.id,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      distinct: ["attendeeId"],
      select: {
        attendeeId: true,
      },
      take: 20_000,
    });

    if (!attendees.length) {
      continue;
    }

    const result = await createNotificationDeliveries({
      orgId: event.orgId,
      eventId: event.id,
      userIds: attendees.map((entry) => entry.attendeeId),
      type: NotificationType.EVENT_REMINDER,
      subject: `Reminder: ${event.title} starts soon`,
      content: renderReminderMessage({
        eventTitle: event.title,
        startAt: event.startAt,
        timezone: event.timezone,
        template: event.reminderEmailTemplate,
      }),
      channels: CHANNEL_DEFAULTS_BY_TYPE[NotificationType.EVENT_REMINDER],
      idempotencyKeyBase: `txn:reminder:${event.id}:${leadHours}`,
      metadata: {
        eventId: event.id,
        leadHours,
      },
      maxAttempts: 6,
    });

    queued += result.created;
  }

  return queued;
}

async function processNotificationDelivery(delivery: {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  subject: string | null;
  content: string;
  recipientAddress: string | null;
  metadata: Prisma.JsonValue;
  attemptCount: number;
  maxAttempts: number;
  userId: string;
  recipient: {
    id: string;
    email: string;
  };
}) {
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId: delivery.userId,
    },
  });

  const preferenceSnapshot = toNotificationPreferencesSnapshot({
    userId: delivery.userId,
    emailEnabled: preference?.emailEnabled,
    smsEnabled: preference?.smsEnabled,
    pushEnabled: preference?.pushEnabled,
    inAppEnabled: preference?.inAppEnabled,
    emailConsent: preference?.emailConsent,
    smsConsent: preference?.smsConsent,
    pushConsent: preference?.pushConsent,
    marketingOptIn: preference?.marketingOptIn,
    updatedAt: preference?.updatedAt,
  });

  const channelGate = isChannelAllowedByPreference(
    delivery.type,
    delivery.channel,
    preferenceSnapshot,
  );

  const nextAttemptNumber = delivery.attemptCount + 1;

  if (!channelGate.allowed) {
    await prisma.$transaction(async (tx) => {
      await tx.notificationDeliveryAttempt.create({
        data: {
          notificationId: delivery.id,
          attemptNumber: nextAttemptNumber,
          status: NotificationAttemptStatus.SKIPPED,
          provider: "PREFERENCE_GATE",
          responseCode: "DELIVERY_SKIPPED",
          responseMessage: channelGate.reason,
        },
      });

      await tx.notificationDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: NotificationDeliveryStatus.CANCELLED,
          attemptCount: nextAttemptNumber,
          failureReason: channelGate.reason,
          failedAt: now(),
          nextAttemptAt: now(),
        },
      });
    });

    return "cancelled" as const;
  }

  const dispatchResult = await dispatchNotificationChannel(delivery.channel, {
    type: delivery.type,
    subject: delivery.subject ?? undefined,
    content: delivery.content,
    metadata: delivery.metadata,
    recipientAddress: delivery.recipientAddress ?? undefined,
    user: delivery.recipient,
  });

  if (dispatchResult.success) {
    await prisma.$transaction(async (tx) => {
      await tx.notificationDeliveryAttempt.create({
        data: {
          notificationId: delivery.id,
          attemptNumber: nextAttemptNumber,
          status: NotificationAttemptStatus.SENT,
          provider: dispatchResult.provider,
          responseCode: dispatchResult.responseCode,
          responseMessage: dispatchResult.responseMessage,
        },
      });

      await tx.notificationDelivery.update({
        where: {
          id: delivery.id,
        },
        data: {
          status: NotificationDeliveryStatus.SENT,
          recipientAddress:
            dispatchResult.resolvedRecipientAddress ??
            delivery.recipientAddress ??
            (delivery.channel === NotificationChannel.EMAIL
              ? delivery.recipient.email
              : undefined),
          attemptCount: nextAttemptNumber,
          sentAt: now(),
          failureReason: null,
          failedAt: null,
          nextAttemptAt: now(),
        },
      });
    });

    return "sent" as const;
  }

  const shouldDeadLetter = nextAttemptNumber >= delivery.maxAttempts;
  const failureReason =
    normalizeOptionalText(dispatchResult.responseMessage) ?? "delivery_failed";

  await prisma.$transaction(async (tx) => {
    await tx.notificationDeliveryAttempt.create({
      data: {
        notificationId: delivery.id,
        attemptNumber: nextAttemptNumber,
        status: NotificationAttemptStatus.FAILED,
        provider: dispatchResult.provider,
        responseCode: dispatchResult.responseCode,
        responseMessage: dispatchResult.responseMessage,
      },
    });

    await tx.notificationDelivery.update({
      where: {
        id: delivery.id,
      },
      data: {
        status: shouldDeadLetter
          ? NotificationDeliveryStatus.DEAD_LETTER
          : NotificationDeliveryStatus.PENDING,
        attemptCount: nextAttemptNumber,
        failureReason,
        failedAt: shouldDeadLetter ? now() : null,
        nextAttemptAt: shouldDeadLetter
          ? now()
          : new Date(Date.now() + getRetryDelayMs(nextAttemptNumber)),
      },
    });
  });

  return shouldDeadLetter ? ("dead_lettered" as const) : ("retried" as const);
}

export async function getMyNotificationPreferences() {
  const session = await requireAuthenticatedSession();

  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId: session.user.id,
    },
  });

  return toNotificationPreferencesSnapshot({
    userId: session.user.id,
    emailEnabled: preference?.emailEnabled,
    smsEnabled: preference?.smsEnabled,
    pushEnabled: preference?.pushEnabled,
    inAppEnabled: preference?.inAppEnabled,
    emailConsent: preference?.emailConsent,
    smsConsent: preference?.smsConsent,
    pushConsent: preference?.pushConsent,
    marketingOptIn: preference?.marketingOptIn,
    updatedAt: preference?.updatedAt,
  });
}

export async function updateMyNotificationPreferences(
  input: UpdateMyNotificationPreferencesInput,
) {
  const session = await requireAuthenticatedSession();
  const parsed = parseUpdateMyNotificationPreferencesInput(input);

  const updated = await prisma.notificationPreference.upsert({
    where: {
      userId: session.user.id,
    },
    create: {
      userId: session.user.id,
      emailEnabled: parsed.emailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
      smsEnabled: parsed.smsEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.smsEnabled,
      pushEnabled: parsed.pushEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.pushEnabled,
      inAppEnabled: parsed.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled,
      emailConsent: parsed.emailConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.emailConsent,
      smsConsent: parsed.smsConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.smsConsent,
      pushConsent: parsed.pushConsent ?? DEFAULT_NOTIFICATION_PREFERENCES.pushConsent,
      marketingOptIn:
        parsed.marketingOptIn ?? DEFAULT_NOTIFICATION_PREFERENCES.marketingOptIn,
    },
    update: {
      ...parsed,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "notifications.preferences.updated",
    scopeType: ScopeType.PERSONAL,
    scopeId: session.user.id,
    targetType: "NotificationPreference",
    targetId: updated.id,
    newValue: {
      emailEnabled: updated.emailEnabled,
      smsEnabled: updated.smsEnabled,
      pushEnabled: updated.pushEnabled,
      inAppEnabled: updated.inAppEnabled,
      emailConsent: updated.emailConsent,
      smsConsent: updated.smsConsent,
      pushConsent: updated.pushConsent,
      marketingOptIn: updated.marketingOptIn,
    },
  });

  return toNotificationPreferencesSnapshot({
    userId: updated.userId,
    emailEnabled: updated.emailEnabled,
    smsEnabled: updated.smsEnabled,
    pushEnabled: updated.pushEnabled,
    inAppEnabled: updated.inAppEnabled,
    emailConsent: updated.emailConsent,
    smsConsent: updated.smsConsent,
    pushConsent: updated.pushConsent,
    marketingOptIn: updated.marketingOptIn,
    updatedAt: updated.updatedAt,
  });
}

export async function listMyNotifications(query: ListMyNotificationsQuery) {
  const session = await requireAuthenticatedSession();
  const parsedQuery = parseListMyNotificationsQuery(query);

  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      userId: session.user.id,
      status: parsedQuery.status,
      type: parsedQuery.type,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsedQuery.take,
    select: {
      id: true,
      type: true,
      channel: true,
      status: true,
      subject: true,
      content: true,
      recipientAddress: true,
      scheduledFor: true,
      nextAttemptAt: true,
      attemptCount: true,
      maxAttempts: true,
      failureReason: true,
      sentAt: true,
      failedAt: true,
      eventId: true,
      userId: true,
      createdAt: true,
    },
  });

  return deliveries.map((delivery) => toNotificationDeliveryListItem(delivery));
}

export async function enqueueTransactionalNotification(
  eventId: string,
  input: EnqueueTransactionalNotificationInput,
) {
  const parsedInput = parseEnqueueTransactionalNotificationInput(input);
  const authz = await requireNotificationManagePermission(
    eventId,
    "notifications.transactional.enqueue",
  );
  const event = await loadEventNotificationContext(eventId);

  const targetUser = await prisma.user.findUnique({
    where: {
      id: parsedInput.userId,
    },
    select: {
      id: true,
    },
  });

  if (!targetUser) {
    throw new NotificationDomainError(
      422,
      "UNPROCESSABLE_NOTIFICATION",
      "Target user does not exist.",
    );
  }

  const result = await createNotificationDeliveries({
    orgId: event.orgId,
    eventId: event.id,
    userIds: [parsedInput.userId],
    type: parsedInput.type,
    subject: parsedInput.subject,
    content: parsedInput.content,
    channels: parsedInput.channels ?? CHANNEL_DEFAULTS_BY_TYPE[parsedInput.type],
    idempotencyKeyBase:
      parsedInput.idempotencyKey ??
      `txn:${event.id}:${parsedInput.type}:${parsedInput.userId}:${crypto.randomUUID()}`,
    metadata: parsedInput.metadata,
    scheduledFor: parsedInput.scheduledFor,
    maxAttempts: parsedInput.maxAttempts,
    createdBy: authz.session.user.id,
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "notifications.transactional.enqueued",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "NotificationDelivery",
    targetId: eventId,
    newValue: {
      type: parsedInput.type,
      userId: parsedInput.userId,
      created: result.created,
      deduped: result.deduped,
      channels: parsedInput.channels ?? CHANNEL_DEFAULTS_BY_TYPE[parsedInput.type],
    },
  });

  return result;
}

export async function enqueueSystemNotification(
  input: EnqueueSystemNotificationInput,
) {
  const parsedInput = parseEnqueueSystemNotificationInput(input);

  return createNotificationDeliveries({
    orgId: parsedInput.orgId,
    eventId: parsedInput.eventId,
    userIds: parsedInput.userIds,
    type: parsedInput.type,
    subject: parsedInput.subject,
    content: parsedInput.content,
    channels:
      parsedInput.channels ?? CHANNEL_DEFAULTS_BY_TYPE[parsedInput.type],
    idempotencyKeyBase: parsedInput.idempotencyKeyBase,
    metadata: parsedInput.metadata,
    scheduledFor: parsedInput.scheduledFor,
    maxAttempts: parsedInput.maxAttempts,
    createdBy: parsedInput.createdBy,
  });
}

export async function sendOrganizerAnnouncement(
  eventId: string,
  input: SendOrganizerAnnouncementInput,
) {
  const parsedInput = parseSendOrganizerAnnouncementInput(input);
  const authz = await requireNotificationManagePermission(
    eventId,
    "notifications.announcement.enqueue",
  );
  const event = await loadEventNotificationContext(eventId);

  const audienceUserIds = await resolveAudienceUserIds(
    eventId,
    parsedInput.audienceType,
    parsedInput.ticketClassId,
  );

  if (!audienceUserIds.length) {
    throw new NotificationDomainError(
      422,
      "NO_RECIPIENTS",
      "No recipients found for the selected audience.",
    );
  }

  const baseContent = parsedInput.content;
  const content = event.organizerAnnouncementTemplate?.includes("{{message}}")
    ? event.organizerAnnouncementTemplate.replaceAll("{{message}}", baseContent)
    : baseContent;
  const metadataOverrides =
    parsedInput.metadata &&
    typeof parsedInput.metadata === "object" &&
    !Array.isArray(parsedInput.metadata)
      ? (parsedInput.metadata as Record<string, unknown>)
      : undefined;

  const result = await createNotificationDeliveries({
    orgId: event.orgId,
    eventId: event.id,
    userIds: audienceUserIds,
    type: NotificationType.ORGANIZER_ANNOUNCEMENT,
    subject: parsedInput.subject ?? `Update from ${event.title}`,
    content,
    channels:
      parsedInput.channels ??
      CHANNEL_DEFAULTS_BY_TYPE[NotificationType.ORGANIZER_ANNOUNCEMENT],
    idempotencyKeyBase:
      parsedInput.idempotencyKey ??
      `announcement:${event.id}:${crypto.randomUUID().replace(/-/g, "")}`,
    metadata: {
      audienceType: parsedInput.audienceType,
      ticketClassId: parsedInput.ticketClassId,
      ...metadataOverrides,
    },
    scheduledFor: parsedInput.scheduledFor,
    maxAttempts: 6,
    createdBy: authz.session.user.id,
  });

  await writeAuditEvent({
    actorId: authz.session.user.id,
    action: "notifications.announcement.enqueued",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "NotificationDelivery",
    targetId: eventId,
    newValue: {
      audienceType: parsedInput.audienceType,
      audienceCount: audienceUserIds.length,
      channels:
        parsedInput.channels ??
        CHANNEL_DEFAULTS_BY_TYPE[NotificationType.ORGANIZER_ANNOUNCEMENT],
      created: result.created,
      deduped: result.deduped,
    },
  });

  return {
    audienceCount: audienceUserIds.length,
    ...result,
  };
}

export async function listEventNotificationDeliveries(
  eventId: string,
  query: ListEventNotificationDeliveriesQuery,
) {
  const parsedQuery = parseListEventNotificationDeliveriesQuery(query);
  await requireNotificationReadPermission(eventId, "notifications.delivery.list");
  await loadEventNotificationContext(eventId);

  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      eventId,
      type: parsedQuery.type,
      channel: parsedQuery.channel,
      status: parsedQuery.status,
      userId: parsedQuery.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: parsedQuery.take,
    select: {
      id: true,
      type: true,
      channel: true,
      status: true,
      subject: true,
      content: true,
      recipientAddress: true,
      scheduledFor: true,
      nextAttemptAt: true,
      attemptCount: true,
      maxAttempts: true,
      failureReason: true,
      sentAt: true,
      failedAt: true,
      eventId: true,
      userId: true,
      createdAt: true,
    },
  });

  return deliveries.map((delivery) => toNotificationDeliveryListItem(delivery));
}

export async function enqueueOrderConfirmationNotification(orderId: string) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      orgId: true,
      eventId: true,
      buyerUserId: true,
      totalAmount: true,
      currency: true,
      event: {
        select: {
          title: true,
          startAt: true,
          timezone: true,
        },
      },
      tickets: {
        select: {
          id: true,
          qrToken: true,
          ticketClass: {
            select: {
              name: true,
            },
          },
          attendee: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new NotificationDomainError(404, "ORDER_NOT_FOUND", "Order not found.");
  }

  const totalAmount = Number(order.totalAmount.toString());
  const result = await createNotificationDeliveries({
    orgId: order.orgId,
    eventId: order.eventId,
    userIds: [order.buyerUserId],
    type: NotificationType.ORDER_CONFIRMATION,
    subject: `Order confirmed for ${order.event.title}`,
    content: `Your order ${order.id} is confirmed. Total paid: ${totalAmount.toFixed(2)} ${order.currency}. Event starts at ${order.event.startAt.toISOString()} (${order.event.timezone}).`,
    channels: CHANNEL_DEFAULTS_BY_TYPE[NotificationType.ORDER_CONFIRMATION],
    idempotencyKeyBase: `txn:order-confirmation:${order.id}`,
    metadata: {
      orderId: order.id,
      eventId: order.eventId,
      eventTitle: order.event.title,
      eventStartAt: order.event.startAt.toISOString(),
      eventTimezone: order.event.timezone,
      totalAmount,
      currency: order.currency,
      manageTicketsUrl: `${env.NEXT_PUBLIC_APP_URL}/attendee/dashboard`,
      tickets: order.tickets.map((ticket) => ({
        id: ticket.id,
        qrToken: ticket.qrToken,
        ticketClassName: ticket.ticketClass.name,
        attendeeName: ticket.attendee.name,
      })),
    },
    maxAttempts: 6,
  });

  return {
    orderId,
    ...result,
  };
}

export async function runNotificationsMaintenance(
  eventId?: string,
): Promise<NotificationsMaintenanceResult> {
  const result: NotificationsMaintenanceResult = {
    queuedReminders: 0,
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    deadLettered: 0,
    cancelled: 0,
  };

  result.queuedReminders = await queueEventReminderNotifications(eventId);

  const dueDeliveries = await prisma.notificationDelivery.findMany({
    where: {
      status: NotificationDeliveryStatus.PENDING,
      scheduledFor: {
        lte: now(),
      },
      nextAttemptAt: {
        lte: now(),
      },
      ...(eventId
        ? {
            eventId,
          }
        : {}),
    },
    orderBy: {
      nextAttemptAt: "asc",
    },
    take: DELIVERY_BATCH_SIZE,
    select: {
      id: true,
      type: true,
      channel: true,
      status: true,
      subject: true,
      content: true,
      recipientAddress: true,
      metadata: true,
      attemptCount: true,
      maxAttempts: true,
      userId: true,
      recipient: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  for (const delivery of dueDeliveries) {
    const outcome = await processNotificationDelivery(delivery);
    result.processed += 1;

    if (outcome === "sent") {
      result.sent += 1;
      continue;
    }

    if (outcome === "retried") {
      result.retried += 1;
      result.failed += 1;
      continue;
    }

    if (outcome === "dead_lettered") {
      result.deadLettered += 1;
      result.failed += 1;
      continue;
    }

    result.cancelled += 1;
  }

  return result;
}
