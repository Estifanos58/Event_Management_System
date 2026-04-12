import {
  EventStatus,
  EventVisibility,
  NotificationType,
  Prisma,
  RegistrationType,
  Role,
  ScopeType,
  TicketStatus,
  TicketReleaseStrategy,
  TicketType,
  VenueMode,
  type Event,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import {
  getServerSessionOrNull,
  resolveActiveContext,
  type BetterSession,
} from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import { env } from "@/core/env";
import { EventDomainError } from "@/domains/events/errors";
import {
  assertTransitionAllowed,
  listAllowedTransitions,
  requiresReasonForTransition,
  requiresVerifiedOrganization,
} from "@/domains/events/lifecycle";
import {
  EVENT_DUPLICATE_MODES,
  type EventBasicsInput,
  type EventDraftInput,
  type EventDuplicateMode,
  type EventExperienceInput,
  type EventGateInput,
  type EventListItem,
  type EventSalesPauseInput,
  type EventSessionInput,
  type EventStaffAssignmentInput,
  type EventTicketClassInput,
  type EventTransitionInput,
} from "@/domains/events/types";
import {
  AuthorizationError,
  createAccessContext,
  requirePermission,
  requireVerifiedOrganization as requireVerifiedOrganizationGuard,
} from "@/domains/identity/guards";
import { canAccess, getPermissions } from "@/domains/identity/permissions";
import { ROLE_DEFAULT_PERMISSIONS } from "@/domains/identity/types";
import {
  findBlockingUserBanForOrganization,
  findGlobalOrganizationBan,
} from "@/domains/moderation/service";
import { enqueueSystemNotification } from "@/domains/notifications/service";

const draftPayloadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Event title must contain at least 3 characters.")
    .max(160, "Event title cannot exceed 160 characters."),
  description: z
    .string()
    .trim()
    .max(4000, "Description cannot exceed 4000 characters.")
    .optional(),
  coverImageUrl: z.url("Cover image URL must be a valid URL.").optional(),
  galleryImages: z.unknown().optional(),
  visibility: z.enum(EventVisibility),
  venueMode: z.enum(VenueMode),
  registrationType: z.enum(RegistrationType),
  venueName: z
    .string()
    .trim()
    .max(160, "Venue name cannot exceed 160 characters.")
    .optional(),
  venueAddress: z
    .string()
    .trim()
    .max(400, "Venue address cannot exceed 400 characters.")
    .optional(),
  virtualMeetingUrl: z.url("Virtual meeting URL must be a valid URL.").optional(),
  totalCapacity: z.coerce
    .number()
    .int("Total capacity must be an integer.")
    .min(1, "Total capacity must be at least 1.")
    .max(1000000, "Total capacity cannot exceed 1000000.")
    .optional(),
  waitlistEnabled: z.boolean().optional(),
  timezone: z
    .string()
    .trim()
    .min(2, "Timezone is required.")
    .max(80, "Timezone cannot exceed 80 characters."),
  startAt: z.coerce.date({
    error: "Start date and time is required.",
  }),
  endAt: z.coerce.date({
    error: "End date and time is required.",
  }),
  publishAt: z.coerce.date().optional(),
  seedSession: z
    .object({
      title: z
        .string()
        .trim()
        .min(2, "Session title must contain at least 2 characters.")
        .max(140, "Session title cannot exceed 140 characters."),
      room: z
        .string()
        .trim()
        .max(140, "Session room cannot exceed 140 characters.")
        .optional(),
      capacity: z.coerce
        .number()
        .int("Session capacity must be an integer.")
        .min(1, "Session capacity must be at least 1.")
        .max(200000, "Session capacity cannot exceed 200000."),
      waitlistEnabled: z.boolean().optional(),
    })
    .optional(),
});

const basicsPayloadSchema = draftPayloadSchema.omit({
  seedSession: true,
});

const transitionPayloadSchema = z.object({
  nextStatus: z.enum(EventStatus),
  reason: z
    .string()
    .trim()
    .max(240, "Transition reason cannot exceed 240 characters.")
    .optional(),
});

const duplicatePayloadSchema = z.object({
  mode: z.enum(EVENT_DUPLICATE_MODES).optional(),
});

const eventSessionPayloadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Session title must contain at least 2 characters.")
    .max(140, "Session title cannot exceed 140 characters."),
  startAt: z.coerce.date({
    error: "Session start date and time is required.",
  }),
  endAt: z.coerce.date({
    error: "Session end date and time is required.",
  }),
  room: z
    .string()
    .trim()
    .max(140, "Session room cannot exceed 140 characters.")
    .optional(),
  capacity: z.coerce
    .number()
    .int("Session capacity must be an integer.")
    .min(1, "Session capacity must be at least 1.")
    .max(200000, "Session capacity cannot exceed 200000."),
  waitlistEnabled: z.boolean().optional(),
});

const eventGatePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Gate name must contain at least 2 characters.")
    .max(100, "Gate name cannot exceed 100 characters."),
  code: z
    .string()
    .trim()
    .max(40, "Gate code cannot exceed 40 characters.")
    .optional(),
  allowedTicketClassIds: z
    .array(z.string().trim().min(1, "Ticket class id is required."))
    .optional(),
});

const eventStaffAssignmentPayloadSchema = z.object({
  staffEmail: z.email("Staff email must be a valid email address."),
  gateId: z.string().trim().min(1, "Gate id is required.").optional(),
  assignmentRole: z
    .string()
    .trim()
    .max(80, "Assignment role cannot exceed 80 characters.")
    .optional(),
});

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9_-]+$/;
const MAX_GALLERY_IMAGES = 12;

const eventTicketClassPayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ticket class name must contain at least 2 characters.")
    .max(120, "Ticket class name cannot exceed 120 characters."),
  type: z.enum(TicketType),
  price: z.coerce
    .number()
    .min(0, "Ticket class price cannot be negative.")
    .max(1000000000, "Ticket class price is too large."),
  currency: z
    .string()
    .trim()
    .length(3, "Currency must be a 3-letter code.")
    .transform((value) => value.toUpperCase()),
  salesStartAt: z.coerce.date({
    error: "Ticket sales start date and time is required.",
  }),
  salesEndAt: z.coerce.date({
    error: "Ticket sales end date and time is required.",
  }),
  capacity: z.coerce
    .number()
    .int("Ticket class capacity must be an integer.")
    .min(1, "Ticket class capacity must be at least 1.")
    .max(200000, "Ticket class capacity cannot exceed 200000."),
  perOrderLimit: z.coerce
    .number()
    .int("Per-order limit must be an integer.")
    .min(1, "Per-order limit must be at least 1.")
    .max(1000, "Per-order limit cannot exceed 1000."),
  hidden: z.boolean().optional(),
  releaseStrategy: z.enum(TicketReleaseStrategy),
  unlockCode: z
    .string()
    .trim()
    .max(64, "Unlock code cannot exceed 64 characters.")
    .optional(),
  dynamicPricingConfig: z.unknown().optional(),
  bulkPricingConfig: z.unknown().optional(),
});

const eventExperiencePayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3, "Custom URL slug must contain at least 3 characters.")
    .max(120, "Custom URL slug cannot exceed 120 characters.")
    .regex(
      SLUG_PATTERN,
      "Custom URL slug must contain only lowercase letters, numbers, and dashes.",
    )
    .optional(),
  brandingTheme: z
    .string()
    .trim()
    .max(64, "Branding theme cannot exceed 64 characters.")
    .optional(),
  brandingLogoUrl: z.url("Branding logo URL must be a valid URL.").optional(),
  brandingPrimaryColor: z
    .string()
    .trim()
    .regex(COLOR_PATTERN, "Primary color must be a valid hex color (e.g. #0EA5E9).")
    .optional(),
  brandingAccentColor: z
    .string()
    .trim()
    .regex(COLOR_PATTERN, "Accent color must be a valid hex color (e.g. #14B8A6).")
    .optional(),
  registrationFormConfig: z.unknown().optional(),
  confirmationEmailTemplate: z
    .string()
    .trim()
    .max(6000, "Confirmation email template cannot exceed 6000 characters.")
    .optional(),
  reminderEmailTemplate: z
    .string()
    .trim()
    .max(6000, "Reminder email template cannot exceed 6000 characters.")
    .optional(),
  reminderLeadHours: z.coerce
    .number()
    .int("Reminder lead hours must be an integer.")
    .min(1, "Reminder lead hours must be at least 1.")
    .max(720, "Reminder lead hours cannot exceed 720.")
    .optional(),
  organizerAnnouncementTemplate: z
    .string()
    .trim()
    .max(6000, "Organizer announcement template cannot exceed 6000 characters.")
    .optional(),
  shareMessage: z
    .string()
    .trim()
    .max(500, "Share message cannot exceed 500 characters.")
    .optional(),
  referralEnabled: z.boolean().optional(),
  referralDefaultCode: z
    .string()
    .trim()
    .max(40, "Referral default code cannot exceed 40 characters.")
    .regex(
      REFERRAL_CODE_PATTERN,
      "Referral default code can contain only uppercase letters, numbers, underscore, and dash.",
    )
    .optional(),
  campaignTrackingEnabled: z.boolean().optional(),
});

const eventSalesPausePayloadSchema = z.object({
  paused: z.boolean(),
  reason: z
    .string()
    .trim()
    .max(240, "Ticket sales control reason cannot exceed 240 characters.")
    .optional(),
});

type ActiveSession = NonNullable<BetterSession>;

type EventDetailRecord = {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  galleryImages: Prisma.JsonValue | null;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  venueName: string | null;
  venueAddress: string | null;
  virtualMeetingUrl: string | null;
  totalCapacity: number | null;
  waitlistEnabled: boolean;
  slug: string | null;
  brandingTheme: string | null;
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingAccentColor: string | null;
  registrationFormConfig: Prisma.JsonValue | null;
  confirmationEmailTemplate: string | null;
  reminderEmailTemplate: string | null;
  reminderLeadHours: number | null;
  organizerAnnouncementTemplate: string | null;
  shareMessage: string | null;
  referralEnabled: boolean;
  referralDefaultCode: string | null;
  campaignTrackingEnabled: boolean;
  ticketSalesPaused: boolean;
  status: EventStatus;
  visibility: EventVisibility;
  startAt: Date;
  endAt: Date;
  timezone: string;
  version: number;
  publishAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  ticketClasses: {
    id: string;
    name: string;
    type: TicketType;
    price: number;
    currency: string;
    salesStartAt: Date;
    salesEndAt: Date;
    capacity: number;
    perOrderLimit: number;
    hidden: boolean;
    releaseStrategy: TicketReleaseStrategy;
    unlockCode: string | null;
    dynamicPricingConfig: Prisma.JsonValue | null;
    bulkPricingConfig: Prisma.JsonValue | null;
  }[];
  eventSessions: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    room: string | null;
    capacity: number;
    waitlistEnabled: boolean;
    status: string;
  }[];
  gates: {
    id: string;
    name: string;
    code: string | null;
    createdAt: Date;
    ticketClassAccesses: {
      id: string;
      ticketClassId: string;
      ticketClass: {
        id: string;
        name: string;
      };
    }[];
    staffAssignments: {
      id: string;
      userId: string;
      assignmentRole: string | null;
      createdAt: Date;
      user: {
        id: string;
        name: string;
        email: string;
      };
    }[];
  }[];
  staffBindings: {
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  }[];
};

const REDACTED_STAFF_EMAIL = "redacted@example.invalid";

function redactEventStaffPii(event: EventDetailRecord): EventDetailRecord {
  return {
    ...event,
    gates: event.gates.map((gate) => ({
      ...gate,
      staffAssignments: gate.staffAssignments.map((assignment) => ({
        ...assignment,
        user: {
          ...assignment.user,
          email: REDACTED_STAFF_EMAIL,
        },
      })),
    })),
    staffBindings: event.staffBindings.map((binding) => ({
      ...binding,
      user: {
        ...binding.user,
        email: REDACTED_STAFF_EMAIL,
      },
    })),
  };
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseOptionalJsonConfig(
  value: unknown,
  fieldLabel: string,
): Prisma.InputJsonValue | undefined {
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
      throw new EventDomainError(
        400,
        "BAD_REQUEST",
        `${fieldLabel} must be valid JSON.`,
      );
    }
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  throw new EventDomainError(
    400,
    "BAD_REQUEST",
    `${fieldLabel} must be a JSON object or array.`,
  );
}

function assertHttpUrl(value: string, fieldLabel: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new EventDomainError(
      400,
      "BAD_REQUEST",
      `${fieldLabel} must be a valid URL.`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EventDomainError(
      400,
      "BAD_REQUEST",
      `${fieldLabel} must use http or https.`,
    );
  }
}

function parseOptionalGalleryImageUrls(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  let rawValues: unknown = value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return undefined;
    }

    if (trimmed.startsWith("[")) {
      try {
        rawValues = JSON.parse(trimmed);
      } catch {
        throw new EventDomainError(
          400,
          "BAD_REQUEST",
          "Gallery images must be valid JSON or a newline-separated URL list.",
        );
      }
    } else {
      rawValues = trimmed
        .split(/[\n,]/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  if (!Array.isArray(rawValues)) {
    throw new EventDomainError(
      400,
      "BAD_REQUEST",
      "Gallery images must be an array of URLs.",
    );
  }

  const normalized = Array.from(
    new Set(
      rawValues
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > MAX_GALLERY_IMAGES) {
    throw new EventDomainError(
      400,
      "BAD_REQUEST",
      `Gallery images cannot exceed ${MAX_GALLERY_IMAGES} URLs.`,
    );
  }

  for (let index = 0; index < normalized.length; index += 1) {
    assertHttpUrl(normalized[index], `Gallery image URL at position ${index + 1}`);
  }

  return normalized;
}

function assertScheduleWindow(startAt: Date, endAt: Date, publishAt?: Date) {
  if (startAt.getTime() >= endAt.getTime()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Event end time must be after start time.",
    );
  }

  if (publishAt && publishAt.getTime() > endAt.getTime()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Publish date cannot be after event end time.",
    );
  }
}

function assertVenueAndRegistrationConfiguration(input: {
  venueMode: VenueMode;
  registrationType: RegistrationType;
  venueName?: string;
  venueAddress?: string;
  virtualMeetingUrl?: string;
  totalCapacity?: number;
}) {
  const hasPhysicalVenue = Boolean(input.venueName || input.venueAddress);

  if (input.venueMode !== VenueMode.VIRTUAL && !hasPhysicalVenue) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Physical and hybrid events require a venue name or address.",
    );
  }

  if (
    (input.venueMode === VenueMode.VIRTUAL || input.venueMode === VenueMode.HYBRID) &&
    !input.virtualMeetingUrl
  ) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Virtual and hybrid events require a virtual meeting URL.",
    );
  }

  if (
    input.registrationType !== RegistrationType.OPEN &&
    input.totalCapacity === undefined
  ) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Restricted registration modes require total capacity to be set.",
    );
  }
}

async function requireAuthenticatedSession(): Promise<ActiveSession> {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new AuthorizationError(401, "Authentication is required.");
  }

  return session;
}

async function requireOrganizationAuthoringContext(action: string) {
  const session = await requireAuthenticatedSession();
  const activeContext = resolveActiveContext(session, session.user.id);

  if (!activeContext || activeContext.type !== ScopeType.ORGANIZATION) {
    throw new EventDomainError(
      400,
      "INVALID_CONTEXT",
      "Switch to an organization context before authoring events.",
    );
  }

  await requirePermission({
    context: activeContext,
    permission: "event.manage",
    action,
    targetType: "Event",
    targetId: `org:${activeContext.id}`,
  });

  return {
    session,
    context: activeContext,
  };
}

async function loadEventOrThrow(eventId: string): Promise<EventDetailRecord> {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      description: true,
      coverImageUrl: true,
      galleryImages: true,
      venueMode: true,
      registrationType: true,
      venueName: true,
      venueAddress: true,
      virtualMeetingUrl: true,
      totalCapacity: true,
      waitlistEnabled: true,
      slug: true,
      brandingTheme: true,
      brandingLogoUrl: true,
      brandingPrimaryColor: true,
      brandingAccentColor: true,
      registrationFormConfig: true,
      confirmationEmailTemplate: true,
      reminderEmailTemplate: true,
      reminderLeadHours: true,
      organizerAnnouncementTemplate: true,
      shareMessage: true,
      referralEnabled: true,
      referralDefaultCode: true,
      campaignTrackingEnabled: true,
      ticketSalesPaused: true,
      status: true,
      visibility: true,
      startAt: true,
      endAt: true,
      timezone: true,
      version: true,
      publishAt: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      ticketClasses: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          currency: true,
          salesStartAt: true,
          salesEndAt: true,
          capacity: true,
          perOrderLimit: true,
          hidden: true,
          releaseStrategy: true,
          unlockCode: true,
          dynamicPricingConfig: true,
          bulkPricingConfig: true,
        },
      },
      eventSessions: {
        orderBy: {
          startAt: "asc",
        },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          room: true,
          capacity: true,
          waitlistEnabled: true,
          status: true,
        },
      },
      gates: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          code: true,
          createdAt: true,
          ticketClassAccesses: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              ticketClassId: true,
              ticketClass: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          staffAssignments: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              userId: true,
              assignmentRole: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      roleBindings: {
        where: {
          role: Role.STAFF,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new EventDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const { roleBindings, ticketClasses, ...rest } = event;

  return {
    ...rest,
    ticketClasses: ticketClasses.map((ticketClass) => ({
      ...ticketClass,
      price: Number(ticketClass.price),
    })),
    staffBindings: roleBindings,
  };
}

async function requireEventAccess(eventId: string, permission: "event.read" | "event.manage", action: string) {
  const context = createAccessContext(ScopeType.EVENT, eventId);
  return requirePermission({
    context,
    permission,
    action,
    targetType: "Event",
    targetId: eventId,
  });
}

function assertEditableStatus(status: EventStatus) {
  if (status === EventStatus.CANCELLED || status === EventStatus.ARCHIVED) {
    throw new EventDomainError(
      409,
      "INVALID_TRANSITION",
      "Cancelled or archived events cannot be edited.",
    );
  }
}

function assertReadyForReview(event: Event) {
  if (!event.title.trim()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Event title is required before review submission.",
    );
  }

  assertScheduleWindow(event.startAt, event.endAt, event.publishAt ?? undefined);
}

async function assertReadyForPublish(event: Event) {
  const sessionCount = await prisma.eventSession.count({
    where: {
      eventId: event.id,
    },
  });

  if (sessionCount === 0) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "At least one event session is required before publishing.",
    );
  }

  if (event.publishAt && event.publishAt.getTime() > Date.now()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Scheduled publish date is in the future. Wait for schedule or clear publish date.",
    );
  }
}

export function parseEventDraftInput(payload: unknown): EventDraftInput {
  const source = (payload ?? {}) as Record<string, unknown>;
  const parsed = draftPayloadSchema.parse({
    ...source,
    coverImageUrl:
      typeof source.coverImageUrl === "string"
        ? normalizeOptionalText(source.coverImageUrl)
        : undefined,
    virtualMeetingUrl:
      typeof source.virtualMeetingUrl === "string"
        ? normalizeOptionalText(source.virtualMeetingUrl)
        : undefined,
  });
  const description = normalizeOptionalText(parsed.description);
  const venueName = normalizeOptionalText(parsed.venueName);
  const venueAddress = normalizeOptionalText(parsed.venueAddress);
  const galleryImages = parseOptionalGalleryImageUrls(parsed.galleryImages);

  if (parsed.coverImageUrl) {
    assertHttpUrl(parsed.coverImageUrl, "Cover image URL");
  }

  assertScheduleWindow(parsed.startAt, parsed.endAt, parsed.publishAt);
  assertVenueAndRegistrationConfiguration({
    venueMode: parsed.venueMode,
    registrationType: parsed.registrationType,
    venueName,
    venueAddress,
    virtualMeetingUrl: parsed.virtualMeetingUrl,
    totalCapacity: parsed.totalCapacity,
  });

  return {
    title: parsed.title,
    description,
    coverImageUrl: parsed.coverImageUrl,
    galleryImages,
    visibility: parsed.visibility,
    venueMode: parsed.venueMode,
    registrationType: parsed.registrationType,
    venueName,
    venueAddress,
    virtualMeetingUrl: parsed.virtualMeetingUrl,
    totalCapacity: parsed.totalCapacity,
    waitlistEnabled: parsed.waitlistEnabled ?? false,
    timezone: parsed.timezone,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    publishAt: parsed.publishAt,
    seedSession: parsed.seedSession
      ? {
          title: parsed.seedSession.title,
          room: normalizeOptionalText(parsed.seedSession.room),
          capacity: parsed.seedSession.capacity,
          waitlistEnabled: parsed.seedSession.waitlistEnabled ?? false,
        }
      : undefined,
  };
}

export function parseEventBasicsInput(payload: unknown): EventBasicsInput {
  const source = (payload ?? {}) as Record<string, unknown>;
  const parsed = basicsPayloadSchema.parse({
    ...source,
    coverImageUrl:
      typeof source.coverImageUrl === "string"
        ? normalizeOptionalText(source.coverImageUrl)
        : undefined,
    virtualMeetingUrl:
      typeof source.virtualMeetingUrl === "string"
        ? normalizeOptionalText(source.virtualMeetingUrl)
        : undefined,
  });
  const description = normalizeOptionalText(parsed.description);
  const venueName = normalizeOptionalText(parsed.venueName);
  const venueAddress = normalizeOptionalText(parsed.venueAddress);
  const galleryImages = parseOptionalGalleryImageUrls(parsed.galleryImages);

  if (parsed.coverImageUrl) {
    assertHttpUrl(parsed.coverImageUrl, "Cover image URL");
  }

  assertScheduleWindow(parsed.startAt, parsed.endAt, parsed.publishAt);
  assertVenueAndRegistrationConfiguration({
    venueMode: parsed.venueMode,
    registrationType: parsed.registrationType,
    venueName,
    venueAddress,
    virtualMeetingUrl: parsed.virtualMeetingUrl,
    totalCapacity: parsed.totalCapacity,
  });

  return {
    title: parsed.title,
    description,
    coverImageUrl: parsed.coverImageUrl,
    galleryImages,
    visibility: parsed.visibility,
    venueMode: parsed.venueMode,
    registrationType: parsed.registrationType,
    venueName,
    venueAddress,
    virtualMeetingUrl: parsed.virtualMeetingUrl,
    totalCapacity: parsed.totalCapacity,
    waitlistEnabled: parsed.waitlistEnabled ?? false,
    timezone: parsed.timezone,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    publishAt: parsed.publishAt,
  };
}

export function parseEventTransitionInput(payload: unknown): EventTransitionInput {
  const parsed = transitionPayloadSchema.parse(payload);

  return {
    nextStatus: parsed.nextStatus,
    reason: normalizeOptionalText(parsed.reason),
  };
}

export function parseEventDuplicateMode(payload: unknown): EventDuplicateMode {
  const parsed = duplicatePayloadSchema.parse(payload);
  return parsed.mode ?? "WITHOUT_ATTENDEES";
}

export function parseEventSessionInput(payload: unknown): EventSessionInput {
  const parsed = eventSessionPayloadSchema.parse(payload);
  const room = normalizeOptionalText(parsed.room);

  if (parsed.startAt.getTime() >= parsed.endAt.getTime()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Session end time must be after start time.",
    );
  }

  return {
    title: parsed.title,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    room,
    capacity: parsed.capacity,
    waitlistEnabled: parsed.waitlistEnabled ?? false,
  };
}

export function parseEventGateInput(payload: unknown): EventGateInput {
  const parsed = eventGatePayloadSchema.parse(payload);
  const allowedTicketClassIds = Array.from(
    new Set(parsed.allowedTicketClassIds ?? []),
  );

  return {
    name: parsed.name,
    code: normalizeOptionalText(parsed.code),
    allowedTicketClassIds,
  };
}

export function parseEventStaffAssignmentInput(
  payload: unknown,
): EventStaffAssignmentInput {
  const parsed = eventStaffAssignmentPayloadSchema.parse(payload);

  return {
    staffEmail: parsed.staffEmail,
    gateId: normalizeOptionalText(parsed.gateId),
    assignmentRole: normalizeOptionalText(parsed.assignmentRole),
  };
}

export function parseEventTicketClassInput(payload: unknown): EventTicketClassInput {
  const source = (payload ?? {}) as Record<string, unknown>;
  const parsed = eventTicketClassPayloadSchema.parse({
    ...source,
    unlockCode:
      typeof source.unlockCode === "string"
        ? normalizeOptionalText(source.unlockCode)
        : undefined,
  });

  if (parsed.salesStartAt.getTime() >= parsed.salesEndAt.getTime()) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Ticket sales end time must be after sales start time.",
    );
  }

  if (parsed.perOrderLimit > parsed.capacity) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Per-order limit cannot exceed ticket class capacity.",
    );
  }

  if (parsed.type === TicketType.FREE && parsed.price !== 0) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "FREE ticket classes must have a price of 0.",
    );
  }

  if (parsed.type !== TicketType.FREE && parsed.price <= 0) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Paid ticket classes must have a price greater than 0.",
    );
  }

  return {
    name: parsed.name,
    type: parsed.type,
    price: parsed.price,
    currency: parsed.currency,
    salesStartAt: parsed.salesStartAt,
    salesEndAt: parsed.salesEndAt,
    capacity: parsed.capacity,
    perOrderLimit: parsed.perOrderLimit,
    hidden: parsed.hidden ?? false,
    releaseStrategy: parsed.releaseStrategy,
    unlockCode: parsed.unlockCode,
    dynamicPricingConfig: parseOptionalJsonConfig(
      parsed.dynamicPricingConfig,
      "Dynamic pricing config",
    ),
    bulkPricingConfig: parseOptionalJsonConfig(
      parsed.bulkPricingConfig,
      "Bulk pricing config",
    ),
  };
}

export function parseEventExperienceInput(payload: unknown): EventExperienceInput {
  const source = (payload ?? {}) as Record<string, unknown>;
  const parsed = eventExperiencePayloadSchema.parse({
    ...source,
    slug: typeof source.slug === "string" ? normalizeOptionalText(source.slug) : undefined,
    brandingTheme:
      typeof source.brandingTheme === "string"
        ? normalizeOptionalText(source.brandingTheme)
        : undefined,
    brandingLogoUrl:
      typeof source.brandingLogoUrl === "string"
        ? normalizeOptionalText(source.brandingLogoUrl)
        : undefined,
    brandingPrimaryColor:
      typeof source.brandingPrimaryColor === "string"
        ? normalizeOptionalText(source.brandingPrimaryColor)
        : undefined,
    brandingAccentColor:
      typeof source.brandingAccentColor === "string"
        ? normalizeOptionalText(source.brandingAccentColor)
        : undefined,
    confirmationEmailTemplate:
      typeof source.confirmationEmailTemplate === "string"
        ? normalizeOptionalText(source.confirmationEmailTemplate)
        : undefined,
    reminderEmailTemplate:
      typeof source.reminderEmailTemplate === "string"
        ? normalizeOptionalText(source.reminderEmailTemplate)
        : undefined,
    organizerAnnouncementTemplate:
      typeof source.organizerAnnouncementTemplate === "string"
        ? normalizeOptionalText(source.organizerAnnouncementTemplate)
        : undefined,
    shareMessage:
      typeof source.shareMessage === "string"
        ? normalizeOptionalText(source.shareMessage)
        : undefined,
    referralDefaultCode:
      typeof source.referralDefaultCode === "string"
        ? normalizeOptionalText(source.referralDefaultCode)?.toUpperCase()
        : undefined,
  });

  if (parsed.referralEnabled && !parsed.referralDefaultCode) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Referral default code is required when referral tracking is enabled.",
    );
  }

  return {
    slug: parsed.slug,
    brandingTheme: parsed.brandingTheme,
    brandingLogoUrl: parsed.brandingLogoUrl,
    brandingPrimaryColor: parsed.brandingPrimaryColor,
    brandingAccentColor: parsed.brandingAccentColor,
    registrationFormConfig: parseOptionalJsonConfig(
      parsed.registrationFormConfig,
      "Registration form config",
    ),
    confirmationEmailTemplate: parsed.confirmationEmailTemplate,
    reminderEmailTemplate: parsed.reminderEmailTemplate,
    reminderLeadHours: parsed.reminderLeadHours,
    organizerAnnouncementTemplate: parsed.organizerAnnouncementTemplate,
    shareMessage: parsed.shareMessage,
    referralEnabled: parsed.referralEnabled ?? false,
    referralDefaultCode: parsed.referralDefaultCode,
    campaignTrackingEnabled: parsed.campaignTrackingEnabled ?? false,
  };
}

export function parseEventSalesPauseInput(payload: unknown): EventSalesPauseInput {
  const parsed = eventSalesPausePayloadSchema.parse(payload);

  return {
    paused: parsed.paused,
    reason: normalizeOptionalText(parsed.reason),
  };
}

export async function createEventDraft(input: EventDraftInput) {
  const parsedInput = parseEventDraftInput(input);
  const { session, context } = await requireOrganizationAuthoringContext(
    "event.draft.create",
  );

  const event = await prisma.$transaction(async (tx) => {
    const createdEvent = await tx.event.create({
      data: {
        orgId: context.id,
        title: parsedInput.title,
        description: parsedInput.description,
        coverImageUrl: parsedInput.coverImageUrl,
        galleryImages: parsedInput.galleryImages,
        venueMode: parsedInput.venueMode,
        registrationType: parsedInput.registrationType,
        venueName: parsedInput.venueName,
        venueAddress: parsedInput.venueAddress,
        virtualMeetingUrl: parsedInput.virtualMeetingUrl,
        totalCapacity: parsedInput.totalCapacity,
        waitlistEnabled: parsedInput.waitlistEnabled,
        status: EventStatus.DRAFT,
        visibility: parsedInput.visibility,
        startAt: parsedInput.startAt,
        endAt: parsedInput.endAt,
        timezone: parsedInput.timezone,
        publishAt: parsedInput.publishAt,
        createdBy: session.user.id,
      },
    });

    await tx.roleBinding.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId: session.user.id,
          role: Role.ORGANIZER,
          scopeType: ScopeType.EVENT,
          scopeId: createdEvent.id,
        },
      },
      update: {
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
        organizationId: context.id,
        eventId: createdEvent.id,
      },
      create: {
        userId: session.user.id,
        role: Role.ORGANIZER,
        scopeType: ScopeType.EVENT,
        scopeId: createdEvent.id,
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
        organizationId: context.id,
        eventId: createdEvent.id,
      },
    });

    if (parsedInput.seedSession) {
      await tx.eventSession.create({
        data: {
          eventId: createdEvent.id,
          title: parsedInput.seedSession.title,
          startAt: parsedInput.startAt,
          endAt: parsedInput.endAt,
          room: parsedInput.seedSession.room,
          capacity: parsedInput.seedSession.capacity,
          waitlistEnabled: parsedInput.seedSession.waitlistEnabled,
        },
      });
    }

    return createdEvent;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.draft.created",
    scopeType: ScopeType.ORGANIZATION,
    scopeId: context.id,
    targetType: "Event",
    targetId: event.id,
    newValue: {
      title: event.title,
      status: event.status,
      visibility: event.visibility,
      coverImageUrl: event.coverImageUrl,
      venueMode: event.venueMode,
      registrationType: event.registrationType,
      totalCapacity: event.totalCapacity,
      waitlistEnabled: event.waitlistEnabled,
    },
  });

  return event;
}

export async function updateEventBasics(eventId: string, input: EventBasicsInput) {
  const parsedInput = parseEventBasicsInput(input);
  const event = await loadEventOrThrow(eventId);

  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.basics.update",
  );
  assertEditableStatus(event.status);

  const updated = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      title: parsedInput.title,
      description: parsedInput.description,
      coverImageUrl: parsedInput.coverImageUrl,
      galleryImages: parsedInput.galleryImages,
      visibility: parsedInput.visibility,
      venueMode: parsedInput.venueMode,
      registrationType: parsedInput.registrationType,
      venueName: parsedInput.venueName,
      venueAddress: parsedInput.venueAddress,
      virtualMeetingUrl: parsedInput.virtualMeetingUrl,
      totalCapacity: parsedInput.totalCapacity,
      waitlistEnabled: parsedInput.waitlistEnabled,
      timezone: parsedInput.timezone,
      startAt: parsedInput.startAt,
      endAt: parsedInput.endAt,
      publishAt: parsedInput.publishAt,
      version: {
        increment: 1,
      },
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.basics.updated",
    scopeType: ScopeType.EVENT,
    scopeId: updated.id,
    targetType: "Event",
    targetId: updated.id,
    oldValue: {
      title: event.title,
      coverImageUrl: event.coverImageUrl,
      visibility: event.visibility,
      venueMode: event.venueMode,
      registrationType: event.registrationType,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      virtualMeetingUrl: event.virtualMeetingUrl,
      totalCapacity: event.totalCapacity,
      waitlistEnabled: event.waitlistEnabled,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      timezone: event.timezone,
      version: event.version,
    },
    newValue: {
      title: updated.title,
      coverImageUrl: updated.coverImageUrl,
      visibility: updated.visibility,
      venueMode: updated.venueMode,
      registrationType: updated.registrationType,
      venueName: updated.venueName,
      venueAddress: updated.venueAddress,
      virtualMeetingUrl: updated.virtualMeetingUrl,
      totalCapacity: updated.totalCapacity,
      waitlistEnabled: updated.waitlistEnabled,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt.toISOString(),
      timezone: updated.timezone,
      version: updated.version,
    },
  });

  return updated;
}

export async function transitionEventStatus(
  eventId: string,
  input: EventTransitionInput,
) {
  const transition = parseEventTransitionInput(input);
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
  });

  if (!event) {
    throw new EventDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const context = createAccessContext(ScopeType.EVENT, eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.lifecycle.transition",
  );

  assertTransitionAllowed(event.status, transition.nextStatus);

  if (requiresReasonForTransition(transition.nextStatus) && !transition.reason) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      `A reason is required for ${transition.nextStatus.toLowerCase()} transitions.`,
    );
  }

  if (transition.nextStatus === EventStatus.IN_REVIEW) {
    assertReadyForReview(event);
  }

  if (transition.nextStatus === EventStatus.PUBLISHED) {
    await assertReadyForPublish(event);

    const blockingUserBan = await findBlockingUserBanForOrganization(
      event.orgId,
      session.user.id,
    );
    if (blockingUserBan) {
      throw new EventDomainError(
        403,
        "INVALID_TRANSITION",
        "Your account is currently restricted from publishing events for this organization.",
      );
    }

    const organizationBan = await findGlobalOrganizationBan(event.orgId);
    if (organizationBan) {
      throw new EventDomainError(
        403,
        "INVALID_TRANSITION",
        "Your organization is currently restricted from publishing events.",
      );
    }
  }

  if (requiresVerifiedOrganization(transition.nextStatus)) {
    await requireVerifiedOrganizationGuard(
      context,
      session.user.id,
      "event.lifecycle.transition",
      "Event",
      eventId,
    );
  }

  const updated = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      status: transition.nextStatus,
      version: {
        increment: 1,
      },
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.lifecycle.transitioned",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    reason: transition.reason,
    oldValue: {
      status: event.status,
      version: event.version,
    },
    newValue: {
      status: updated.status,
      version: updated.version,
    },
  });

  if (
    updated.status === EventStatus.CANCELLED ||
    updated.status === EventStatus.POSTPONED
  ) {
    const attendeeRows = await prisma.ticket.findMany({
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
      take: 20_000,
    });

    if (attendeeRows.length > 0) {
      void enqueueSystemNotification({
        eventId,
        orgId: event.orgId,
        userIds: attendeeRows.map((entry) => entry.attendeeId),
        type: NotificationType.EVENT_STATUS_CHANGED,
        subject: `Event update: ${event.title}`,
        content: `This event status changed from ${event.status} to ${updated.status}.`,
        idempotencyKeyBase: `txn:event-status:${eventId}:${updated.version}`,
        metadata: {
          eventTitle: event.title,
          previousStatus: event.status,
          nextStatus: updated.status,
          reason: transition.reason,
          startAt: event.startAt.toISOString(),
          timezone: event.timezone,
          eventUrl: `${env.NEXT_PUBLIC_APP_URL}/events/${eventId}`,
        },
        maxAttempts: 6,
      }).catch((error) => {
        console.warn("Failed to enqueue event status notifications", {
          eventId,
          status: updated.status,
          error: error instanceof Error ? error.message : "unknown",
        });
      });
    }
  }

  return updated;
}

export async function duplicateEventAsDraft(
  eventId: string,
  mode: EventDuplicateMode,
) {
  const sourceEvent = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    include: {
      ticketClasses: {
        orderBy: {
          createdAt: "asc",
        },
      },
      eventSessions: {
        orderBy: {
          startAt: "asc",
        },
      },
      gates: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!sourceEvent) {
    throw new EventDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.duplicate",
  );

  const duplicated = await prisma.$transaction(async (tx) => {
    const cloned = await tx.event.create({
      data: {
        orgId: sourceEvent.orgId,
        title: `${sourceEvent.title} (Copy)`,
        description: sourceEvent.description,
        coverImageUrl: sourceEvent.coverImageUrl,
        galleryImages: sourceEvent.galleryImages ?? undefined,
        venueMode: sourceEvent.venueMode,
        registrationType: sourceEvent.registrationType,
        venueName: sourceEvent.venueName,
        venueAddress: sourceEvent.venueAddress,
        virtualMeetingUrl: sourceEvent.virtualMeetingUrl,
        totalCapacity: sourceEvent.totalCapacity,
        waitlistEnabled: sourceEvent.waitlistEnabled,
        slug: null,
        brandingTheme: sourceEvent.brandingTheme,
        brandingLogoUrl: sourceEvent.brandingLogoUrl,
        brandingPrimaryColor: sourceEvent.brandingPrimaryColor,
        brandingAccentColor: sourceEvent.brandingAccentColor,
        registrationFormConfig: sourceEvent.registrationFormConfig ?? undefined,
        confirmationEmailTemplate: sourceEvent.confirmationEmailTemplate,
        reminderEmailTemplate: sourceEvent.reminderEmailTemplate,
        reminderLeadHours: sourceEvent.reminderLeadHours,
        organizerAnnouncementTemplate: sourceEvent.organizerAnnouncementTemplate,
        shareMessage: sourceEvent.shareMessage,
        referralEnabled: sourceEvent.referralEnabled,
        referralDefaultCode: sourceEvent.referralDefaultCode,
        campaignTrackingEnabled: sourceEvent.campaignTrackingEnabled,
        ticketSalesPaused: false,
        status: EventStatus.DRAFT,
        visibility: sourceEvent.visibility,
        startAt: sourceEvent.startAt,
        endAt: sourceEvent.endAt,
        timezone: sourceEvent.timezone,
        publishAt: null,
        version: 1,
        createdBy: session.user.id,
      },
    });

    await tx.roleBinding.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId: session.user.id,
          role: Role.ORGANIZER,
          scopeType: ScopeType.EVENT,
          scopeId: cloned.id,
        },
      },
      update: {
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
        organizationId: sourceEvent.orgId,
        eventId: cloned.id,
      },
      create: {
        userId: session.user.id,
        role: Role.ORGANIZER,
        scopeType: ScopeType.EVENT,
        scopeId: cloned.id,
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.ORGANIZER],
        organizationId: sourceEvent.orgId,
        eventId: cloned.id,
      },
    });

    if (mode !== "STRUCTURE_ONLY" && sourceEvent.eventSessions.length > 0) {
      await tx.eventSession.createMany({
        data: sourceEvent.eventSessions.map((eventSession) => ({
          eventId: cloned.id,
          title: eventSession.title,
          startAt: eventSession.startAt,
          endAt: eventSession.endAt,
          room: eventSession.room,
          capacity: eventSession.capacity,
          waitlistEnabled: eventSession.waitlistEnabled,
          status: eventSession.status,
        })),
      });
    }

    if (mode !== "STRUCTURE_ONLY" && sourceEvent.gates.length > 0) {
      await tx.gate.createMany({
        data: sourceEvent.gates.map((gate) => ({
          eventId: cloned.id,
          name: gate.name,
          code: gate.code,
        })),
      });
    }

    if (mode !== "STRUCTURE_ONLY" && sourceEvent.ticketClasses.length > 0) {
      await tx.ticketClass.createMany({
        data: sourceEvent.ticketClasses.map((ticketClass) => ({
          eventId: cloned.id,
          name: ticketClass.name,
          type: ticketClass.type,
          price: ticketClass.price,
          currency: ticketClass.currency,
          salesStartAt: ticketClass.salesStartAt,
          salesEndAt: ticketClass.salesEndAt,
          capacity: ticketClass.capacity,
          perOrderLimit: ticketClass.perOrderLimit,
          hidden: ticketClass.hidden,
          releaseStrategy: ticketClass.releaseStrategy,
          unlockCode: ticketClass.unlockCode,
          dynamicPricingConfig: ticketClass.dynamicPricingConfig ?? undefined,
          bulkPricingConfig: ticketClass.bulkPricingConfig ?? undefined,
        })),
      });
    }

    return cloned;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.duplicated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: duplicated.id,
    newValue: {
      sourceEventId: eventId,
      mode,
      duplicatedEventId: duplicated.id,
    },
  });

  return duplicated;
}

export async function createEventSession(
  eventId: string,
  input: EventSessionInput,
) {
  const parsedInput = parseEventSessionInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.session.create",
  );

  assertEditableStatus(event.status);

  if (
    parsedInput.startAt.getTime() < event.startAt.getTime() ||
    parsedInput.endAt.getTime() > event.endAt.getTime()
  ) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Session schedule must be within the event start and end window.",
    );
  }

  const createdSession = await prisma.$transaction(async (tx) => {
    const newSession = await tx.eventSession.create({
      data: {
        eventId,
        title: parsedInput.title,
        startAt: parsedInput.startAt,
        endAt: parsedInput.endAt,
        room: parsedInput.room,
        capacity: parsedInput.capacity,
        waitlistEnabled: parsedInput.waitlistEnabled,
      },
    });

    await tx.event.update({
      where: {
        id: eventId,
      },
      data: {
        version: {
          increment: 1,
        },
      },
    });

    return newSession;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.session.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "EventSession",
    targetId: createdSession.id,
    newValue: {
      title: createdSession.title,
      startAt: createdSession.startAt.toISOString(),
      endAt: createdSession.endAt.toISOString(),
      capacity: createdSession.capacity,
      waitlistEnabled: createdSession.waitlistEnabled,
    },
  });

  return createdSession;
}

export async function createEventGate(eventId: string, input: EventGateInput) {
  const parsedInput = parseEventGateInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.gate.create",
  );

  assertEditableStatus(event.status);

  const ticketClassesById = new Map(
    event.ticketClasses.map((ticketClass) => [ticketClass.id, ticketClass.name]),
  );

  if (
    ticketClassesById.size > 0 &&
    parsedInput.allowedTicketClassIds.length === 0
  ) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "At least one ticket class must be mapped when creating a gate.",
    );
  }

  const invalidTicketClassIds = parsedInput.allowedTicketClassIds.filter(
    (ticketClassId) => !ticketClassesById.has(ticketClassId),
  );

  if (invalidTicketClassIds.length > 0) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "One or more selected ticket classes do not belong to this event.",
    );
  }

  const gate = await prisma.$transaction(async (tx) => {
    const createdGate = await tx.gate.create({
      data: {
        eventId,
        name: parsedInput.name,
        code: parsedInput.code,
      },
    });

    if (parsedInput.allowedTicketClassIds.length > 0) {
      await tx.gateTicketClassAccess.createMany({
        data: parsedInput.allowedTicketClassIds.map((ticketClassId) => ({
          eventId,
          gateId: createdGate.id,
          ticketClassId,
        })),
      });
    }

    await tx.event.update({
      where: {
        id: eventId,
      },
      data: {
        version: {
          increment: 1,
        },
      },
    });

    return createdGate;
  });

  const allowedTicketClassNames = parsedInput.allowedTicketClassIds
    .map((ticketClassId) => ticketClassesById.get(ticketClassId))
    .filter((value): value is string => Boolean(value));

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.gate.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Gate",
    targetId: gate.id,
    newValue: {
      name: gate.name,
      code: gate.code,
      allowedTicketClassIds: parsedInput.allowedTicketClassIds,
      allowedTicketClassNames,
    },
  });

  return gate;
}

export async function assignEventStaff(
  eventId: string,
  input: EventStaffAssignmentInput,
) {
  const parsedInput = parseEventStaffAssignmentInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.staff.assign",
  );

  const user = await prisma.user.findUnique({
    where: {
      email: parsedInput.staffEmail,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    throw new EventDomainError(
      404,
      "STAFF_NOT_FOUND",
      "No user found with the provided staff email.",
    );
  }

  const gate = parsedInput.gateId
    ? await prisma.gate.findFirst({
        where: {
          id: parsedInput.gateId,
          eventId,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  if (parsedInput.gateId && !gate) {
    throw new EventDomainError(
      404,
      "GATE_NOT_FOUND",
      "Gate not found in the selected event.",
    );
  }

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.roleBinding.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId: user.id,
          role: Role.STAFF,
          scopeType: ScopeType.EVENT,
          scopeId: eventId,
        },
      },
      update: {
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.STAFF],
        organizationId: event.orgId,
        eventId,
      },
      create: {
        userId: user.id,
        role: Role.STAFF,
        scopeType: ScopeType.EVENT,
        scopeId: eventId,
        permissions: ROLE_DEFAULT_PERMISSIONS[Role.STAFF],
        organizationId: event.orgId,
        eventId,
      },
    });

    if (!gate) {
      return null;
    }

    return tx.gateStaffAssignment.upsert({
      where: {
        gateId_userId: {
          gateId: gate.id,
          userId: user.id,
        },
      },
      update: {
        assignmentRole: parsedInput.assignmentRole,
      },
      create: {
        gateId: gate.id,
        eventId,
        userId: user.id,
        assignmentRole: parsedInput.assignmentRole,
      },
    });
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.staff.assigned",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "User",
    targetId: user.id,
    newValue: {
      staffEmail: user.email,
      gateId: assignment?.gateId,
      assignmentRole: assignment?.assignmentRole ?? parsedInput.assignmentRole,
    },
  });

  void enqueueSystemNotification({
    orgId: event.orgId,
    eventId,
    userIds: [user.id],
    type: NotificationType.STAFF_ASSIGNED,
    subject: `You were assigned as staff for ${event.title}`,
    content: "Your staff access has been granted for this event.",
    idempotencyKeyBase: `txn:staff-assigned:${eventId}:${user.id}:${gate?.id ?? "event"}`,
    metadata: {
      eventTitle: event.title,
      gateName: gate?.name,
      assignmentRole: assignment?.assignmentRole ?? parsedInput.assignmentRole,
      assignedByName: session.user.name,
      dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/staff/dashboard`,
    },
    maxAttempts: 6,
  }).catch((error) => {
    console.warn("Failed to enqueue staff assignment notification", {
      eventId,
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return {
    staff: user,
    gateAssignment: assignment,
  };
}

export async function createEventTicketClass(
  eventId: string,
  input: EventTicketClassInput,
) {
  const parsedInput = parseEventTicketClassInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.ticket_class.create",
  );

  assertEditableStatus(event.status);

  if (
    parsedInput.salesStartAt.getTime() < event.startAt.getTime() ||
    parsedInput.salesEndAt.getTime() > event.endAt.getTime()
  ) {
    throw new EventDomainError(
      422,
      "UNPROCESSABLE_EVENT",
      "Ticket sales window must be within the event schedule window.",
    );
  }

  if (event.totalCapacity !== null) {
    const allocatedCapacity = event.ticketClasses.reduce(
      (total, ticketClass) => total + ticketClass.capacity,
      0,
    );

    if (allocatedCapacity + parsedInput.capacity > event.totalCapacity) {
      throw new EventDomainError(
        422,
        "UNPROCESSABLE_EVENT",
        "Ticket class capacity exceeds event total capacity.",
      );
    }
  }

  const createdTicketClass = await prisma.$transaction(async (tx) => {
    const ticketClass = await tx.ticketClass.create({
      data: {
        eventId,
        name: parsedInput.name,
        type: parsedInput.type,
        price: parsedInput.price,
        currency: parsedInput.currency,
        salesStartAt: parsedInput.salesStartAt,
        salesEndAt: parsedInput.salesEndAt,
        capacity: parsedInput.capacity,
        perOrderLimit: parsedInput.perOrderLimit,
        hidden: parsedInput.hidden,
        releaseStrategy: parsedInput.releaseStrategy,
        unlockCode: parsedInput.unlockCode,
        dynamicPricingConfig: parsedInput.dynamicPricingConfig,
        bulkPricingConfig: parsedInput.bulkPricingConfig,
      },
    });

    await tx.event.update({
      where: {
        id: eventId,
      },
      data: {
        version: {
          increment: 1,
        },
      },
    });

    return ticketClass;
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.ticket_class.created",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "TicketClass",
    targetId: createdTicketClass.id,
    newValue: {
      name: createdTicketClass.name,
      type: createdTicketClass.type,
      price: createdTicketClass.price.toString(),
      currency: createdTicketClass.currency,
      capacity: createdTicketClass.capacity,
      perOrderLimit: createdTicketClass.perOrderLimit,
      hidden: createdTicketClass.hidden,
      releaseStrategy: createdTicketClass.releaseStrategy,
      salesStartAt: createdTicketClass.salesStartAt.toISOString(),
      salesEndAt: createdTicketClass.salesEndAt.toISOString(),
    },
  });

  return createdTicketClass;
}

export async function updateEventExperience(
  eventId: string,
  input: EventExperienceInput,
) {
  const parsedInput = parseEventExperienceInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.experience.update",
  );

  assertEditableStatus(event.status);

  let updated;

  try {
    updated = await prisma.event.update({
      where: {
        id: eventId,
      },
      data: {
        slug: parsedInput.slug,
        brandingTheme: parsedInput.brandingTheme,
        brandingLogoUrl: parsedInput.brandingLogoUrl,
        brandingPrimaryColor: parsedInput.brandingPrimaryColor,
        brandingAccentColor: parsedInput.brandingAccentColor,
        registrationFormConfig: parsedInput.registrationFormConfig,
        confirmationEmailTemplate: parsedInput.confirmationEmailTemplate,
        reminderEmailTemplate: parsedInput.reminderEmailTemplate,
        reminderLeadHours: parsedInput.reminderLeadHours,
        organizerAnnouncementTemplate: parsedInput.organizerAnnouncementTemplate,
        shareMessage: parsedInput.shareMessage,
        referralEnabled: parsedInput.referralEnabled,
        referralDefaultCode: parsedInput.referralDefaultCode,
        campaignTrackingEnabled: parsedInput.campaignTrackingEnabled,
        version: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new EventDomainError(
        409,
        "UNPROCESSABLE_EVENT",
        "Custom URL slug is already in use by another event.",
      );
    }

    throw error;
  }

  await writeAuditEvent({
    actorId: session.user.id,
    action: "event.experience.updated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    oldValue: {
      slug: event.slug,
      brandingTheme: event.brandingTheme,
      referralEnabled: event.referralEnabled,
      campaignTrackingEnabled: event.campaignTrackingEnabled,
    },
    newValue: {
      slug: updated.slug,
      brandingTheme: updated.brandingTheme,
      referralEnabled: updated.referralEnabled,
      campaignTrackingEnabled: updated.campaignTrackingEnabled,
    },
  });

  return updated;
}

export async function setEventTicketSalesPaused(
  eventId: string,
  input: EventSalesPauseInput,
) {
  const parsedInput = parseEventSalesPauseInput(input);
  const event = await loadEventOrThrow(eventId);
  const { session } = await requireEventAccess(
    eventId,
    "event.manage",
    "event.ticket_sales.control",
  );

  const canControlSales = new Set<EventStatus>([
    EventStatus.PUBLISHED,
    EventStatus.LIVE,
    EventStatus.POSTPONED,
  ]);

  if (!canControlSales.has(event.status)) {
    throw new EventDomainError(
      409,
      "INVALID_TRANSITION",
      "Ticket sales control is available only for published, live, or postponed events.",
    );
  }

  if (event.ticketSalesPaused === parsedInput.paused) {
    return prisma.event.findUniqueOrThrow({
      where: {
        id: eventId,
      },
    });
  }

  const updated = await prisma.event.update({
    where: {
      id: eventId,
    },
    data: {
      ticketSalesPaused: parsedInput.paused,
      version: {
        increment: 1,
      },
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: parsedInput.paused
      ? "event.ticket_sales.paused"
      : "event.ticket_sales.resumed",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    reason: parsedInput.reason,
    oldValue: {
      ticketSalesPaused: event.ticketSalesPaused,
    },
    newValue: {
      ticketSalesPaused: updated.ticketSalesPaused,
    },
  });

  return updated;
}

export type EventsOverviewSnapshot = {
  session: ActiveSession;
  activeContext: {
    type: ScopeType;
    id: string;
  };
  canReadEvents: boolean;
  canManageEvents: boolean;
  events: EventListItem[];
};

export async function getEventsOverviewSnapshot(): Promise<EventsOverviewSnapshot | null> {
  const session = await getServerSessionOrNull();

  if (!session) {
    return null;
  }

  const activeContext = resolveActiveContext(session, session.user.id);

  if (!activeContext) {
    return null;
  }

  const resolution = await getPermissions(session.user.id, activeContext);
  const canReadEvents = canAccess(resolution, "event.read");
  const canManageEvents = canAccess(resolution, "event.manage");

  let events: EventListItem[] = [];

  if (canReadEvents) {
    if (activeContext.type === ScopeType.ORGANIZATION) {
      events = await prisma.event.findMany({
        where: {
          orgId: activeContext.id,
        },
        orderBy: {
          startAt: "asc",
        },
        take: 40,
      });
    } else if (activeContext.type === ScopeType.EVENT) {
      events = await prisma.event.findMany({
        where: {
          id: activeContext.id,
        },
      });
    } else if (activeContext.type === ScopeType.PLATFORM) {
      events = await prisma.event.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 40,
      });
    } else if (activeContext.type === ScopeType.PERSONAL) {
      events = await prisma.event.findMany({
        where: {
          createdBy: session.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 40,
      });
    }
  }

  return {
    session,
    activeContext,
    canReadEvents,
    canManageEvents,
    events,
  };
}

export type EventDetailSnapshot = {
  session: ActiveSession;
  event: EventDetailRecord;
  canManageEvent: boolean;
  transitions: EventStatus[];
};

export async function getEventDetailSnapshot(
  eventId: string,
): Promise<EventDetailSnapshot | null> {
  const event = await loadEventOrThrow(eventId);
  const { session, resolution } = await requireEventAccess(
    eventId,
    "event.read",
    "event.detail.view",
  );

  const canManageEvent = canAccess(resolution, "event.manage");
  const eventDetail = canManageEvent ? event : redactEventStaffPii(event);

  return {
    session,
    event: eventDetail,
    canManageEvent,
    transitions: canManageEvent ? listAllowedTransitions(event.status) : [],
  };
}
