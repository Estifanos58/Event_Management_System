import {
  EventStatus,
  EventVisibility,
  Prisma,
  RegistrationType,
  TicketReleaseStrategy,
  TicketType,
  VenueMode,
} from "@prisma/client";

export const EVENT_LIFECYCLE_STEPS: EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.IN_REVIEW,
  EventStatus.APPROVED,
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
  EventStatus.COMPLETED,
  EventStatus.ARCHIVED,
];

export const EVENT_TRANSITION_MAP: Record<EventStatus, EventStatus[]> = {
  [EventStatus.DRAFT]: [EventStatus.IN_REVIEW, EventStatus.ARCHIVED],
  [EventStatus.IN_REVIEW]: [EventStatus.DRAFT, EventStatus.APPROVED],
  [EventStatus.APPROVED]: [EventStatus.DRAFT, EventStatus.PUBLISHED],
  [EventStatus.PUBLISHED]: [
    EventStatus.LIVE,
    EventStatus.POSTPONED,
    EventStatus.CANCELLED,
    EventStatus.ARCHIVED,
  ],
  [EventStatus.LIVE]: [EventStatus.COMPLETED, EventStatus.POSTPONED, EventStatus.CANCELLED],
  [EventStatus.COMPLETED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.POSTPONED]: [
    EventStatus.PUBLISHED,
    EventStatus.CANCELLED,
    EventStatus.ARCHIVED,
  ],
};

export const EVENT_VISIBILITY_OPTIONS: EventVisibility[] = [
  EventVisibility.PUBLIC,
  EventVisibility.UNLISTED,
  EventVisibility.PRIVATE,
];

export const VENUE_MODE_OPTIONS: VenueMode[] = [
  VenueMode.PHYSICAL,
  VenueMode.VIRTUAL,
  VenueMode.HYBRID,
];

export const REGISTRATION_TYPE_OPTIONS: RegistrationType[] = [
  RegistrationType.OPEN,
  RegistrationType.APPROVAL_REQUIRED,
  RegistrationType.APPLICATION_BASED,
];

export const TICKET_TYPE_OPTIONS: TicketType[] = [
  TicketType.FREE,
  TicketType.PAID,
  TicketType.VIP,
];

export const TICKET_RELEASE_STRATEGY_OPTIONS: TicketReleaseStrategy[] = [
  TicketReleaseStrategy.STANDARD,
  TicketReleaseStrategy.EARLY_BIRD,
  TicketReleaseStrategy.PHASED,
  TicketReleaseStrategy.DYNAMIC,
];

export const EVENT_DUPLICATE_MODES = [
  "FULL_COPY",
  "STRUCTURE_ONLY",
  "WITHOUT_ATTENDEES",
] as const;

export type EventDuplicateMode = (typeof EVENT_DUPLICATE_MODES)[number];

export type EventDraftInput = {
  title: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: Prisma.InputJsonValue;
  visibility: EventVisibility;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  venueName?: string;
  venueAddress?: string;
  virtualMeetingUrl?: string;
  totalCapacity?: number;
  waitlistEnabled: boolean;
  timezone: string;
  startAt: Date;
  endAt: Date;
  publishAt?: Date;
  seedSession?: {
    title: string;
    room?: string;
    capacity: number;
    waitlistEnabled: boolean;
  };
};

export type EventBasicsInput = {
  title: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: Prisma.InputJsonValue;
  visibility: EventVisibility;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  venueName?: string;
  venueAddress?: string;
  virtualMeetingUrl?: string;
  totalCapacity?: number;
  waitlistEnabled: boolean;
  timezone: string;
  startAt: Date;
  endAt: Date;
  publishAt?: Date;
};

export type EventSessionInput = {
  title: string;
  startAt: Date;
  endAt: Date;
  room?: string;
  capacity: number;
  waitlistEnabled: boolean;
};

export type EventGateInput = {
  name: string;
  code?: string;
  allowedTicketClassIds: string[];
};

export type EventStaffAssignmentInput = {
  staffEmail: string;
  gateId?: string;
  assignmentRole?: string;
};

export type EventTransitionInput = {
  nextStatus: EventStatus;
  reason?: string;
};

export type EventTicketClassInput = {
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
  unlockCode?: string;
  dynamicPricingConfig?: Prisma.InputJsonValue;
  bulkPricingConfig?: Prisma.InputJsonValue;
};

export type EventExperienceInput = {
  slug?: string;
  brandingTheme?: string;
  brandingLogoUrl?: string;
  brandingPrimaryColor?: string;
  brandingAccentColor?: string;
  registrationFormConfig?: Prisma.InputJsonValue;
  confirmationEmailTemplate?: string;
  reminderEmailTemplate?: string;
  reminderLeadHours?: number;
  organizerAnnouncementTemplate?: string;
  shareMessage?: string;
  referralEnabled: boolean;
  referralDefaultCode?: string;
  campaignTrackingEnabled: boolean;
};

export type EventSalesPauseInput = {
  paused: boolean;
  reason?: string;
};

export type EventListItem = {
  id: string;
  title: string;
  slug: string | null;
  coverImageUrl: string | null;
  galleryImages: Prisma.JsonValue | null;
  status: EventStatus;
  visibility: EventVisibility;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  totalCapacity: number | null;
  waitlistEnabled: boolean;
  ticketSalesPaused: boolean;
  startAt: Date;
  endAt: Date;
  timezone: string;
  version: number;
  publishAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
