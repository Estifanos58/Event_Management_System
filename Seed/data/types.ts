import type { EventStatus, EventVisibility, RegistrationType, VenueMode } from "@prisma/client";

export type SeedUserGroup = "SUPER_ADMIN" | "ORGANIZER" | "STAFF" | "ATTENDEE";

export type SeedUserProfile = {
  id: string;
  name: string;
  email: string;
  group: SeedUserGroup;
};

export type SeedOrganizationProfile = {
  id: string;
  legalName: string;
  displayName: string;
  region: string;
  defaultCurrency: string;
};

export type SeedEventProfile = {
  sequence: number;
  id: string;
  orgId: string;
  createdBy: string;
  title: string;
  description: string;
  status: EventStatus;
  visibility: EventVisibility;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  venueName: string | null;
  venueAddress: string | null;
  virtualMeetingUrl: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  totalCapacity: number;
  waitlistEnabled: boolean;
  coverImageUrl: string | null;
  galleryImages: string[];
  scenario:
    | "SOLD_OUT"
    | "LIVE"
    | "COMPLETED"
    | "CANCELLED"
    | "PRIVATE"
    | "VIRTUAL"
    | "STANDARD";
};

export type SeedTicketClassProfile = {
  id: string;
  eventId: string;
  eventSequence: number;
  name: string;
  tier: "FREE" | "PAID" | "VIP";
  price: number;
  currency: string;
  capacity: number;
};

export type SeedReservationProfile = {
  id: string;
  eventId: string;
  orgId: string;
  userId: string;
  status: "PENDING" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  createdAt: Date;
  expiresAt: Date;
};

export type SeedReservationItemProfile = {
  id: string;
  reservationId: string;
  ticketClassId: string;
  quantity: number;
};

export type SeedOrderProfile = {
  id: string;
  reservationId: string;
  orgId: string;
  eventId: string;
  buyerUserId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  subtotalAmount: number;
  taxAmount: number;
  feeAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  completedAt: Date | null;
  quantity: number;
};

export type SeedTicketProfile = {
  id: string;
  eventId: string;
  ticketClassId: string;
  orderId: string;
  ownerId: string;
  attendeeId: string;
  status: "VALID" | "USED" | "CANCELLED" | "REFUNDED" | "VOID";
  issuedAt: Date;
};
