import {
  EventStatus,
  EventVisibility,
  RegistrationType,
  VenueMode,
  type Prisma,
} from "@prisma/client";
import { addDays, addHours, eventWindow, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile } from "./types";

export const eventImages = [
  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1515169067868-5387ec356754?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1464375117522-1311dd6f9b88?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=1600&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1600&auto=format&fit=crop&q=70",
];

const gallerySets = [
  [
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200&auto=format&fit=crop&q=70",
  ],
  [
    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1503095396549-807759245b35?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=1200&auto=format&fit=crop&q=70",
  ],
  [
    "https://images.unsplash.com/photo-1515169067868-5387ec356754?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&auto=format&fit=crop&q=70",
  ],
  [
    "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1515169067868-5387ec356754?w=1200&auto=format&fit=crop&q=70",
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&auto=format&fit=crop&q=70",
  ],
];

type EventSeedResult = {
  profiles: SeedEventProfile[];
  events: Prisma.EventCreateManyInput[];
  scenarioEventIds: {
    soldOut: string;
    live: string;
    completed: string;
    cancelled: string;
    privateEvent: string;
    virtualEvent: string;
  };
};

type EventBlueprint = {
  title: string;
  description: string;
  status: EventStatus;
  visibility: EventVisibility;
  venueMode: VenueMode;
  registrationType: RegistrationType;
  startOffsetDays: number;
  durationHours: number;
  totalCapacity: number;
  waitlistEnabled: boolean;
  scenario: SeedEventProfile["scenario"];
};

const EVENT_BLUEPRINTS: EventBlueprint[] = [
  {
    title: "Tech Conference 2026",
    description: "A high-volume engineering conference with keynotes, expo halls, and sold-out ticket demand.",
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 14,
    durationHours: 10,
    totalCapacity: 180,
    waitlistEnabled: true,
    scenario: "SOLD_OUT",
  },
  {
    title: "City Innovation Live Sprint",
    description: "A currently running innovation sprint with real-time check-ins and gate activity.",
    status: EventStatus.LIVE,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.HYBRID,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 0,
    durationHours: 14,
    totalCapacity: 320,
    waitlistEnabled: true,
    scenario: "LIVE",
  },
  {
    title: "AI Workshop Intensive",
    description: "Completed hands-on workshop where attendees submitted feedback and ratings.",
    status: EventStatus.COMPLETED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.APPROVAL_REQUIRED,
    startOffsetDays: -35,
    durationHours: 8,
    totalCapacity: 160,
    waitlistEnabled: false,
    scenario: "COMPLETED",
  },
  {
    title: "Music Festival Night Lights",
    description: "A festival cancelled due to severe weather with attendee updates and refunds in motion.",
    status: EventStatus.CANCELLED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 9,
    durationHours: 12,
    totalCapacity: 600,
    waitlistEnabled: true,
    scenario: "CANCELLED",
  },
  {
    title: "Private VIP Networking Circle",
    description: "Invite-only executive networking evening with premium lounge access.",
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PRIVATE,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.APPROVAL_REQUIRED,
    startOffsetDays: 21,
    durationHours: 5,
    totalCapacity: 80,
    waitlistEnabled: false,
    scenario: "PRIVATE",
  },
  {
    title: "Hybrid Webinar Growth Playbook",
    description: "Virtual-first strategic webinar with hybrid breakout rooms and digital networking.",
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.VIRTUAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 6,
    durationHours: 4,
    totalCapacity: 1000,
    waitlistEnabled: false,
    scenario: "VIRTUAL",
  },
  {
    title: "Startup Community Demo Day",
    description: "Early-stage product demos and investor Q&A sessions.",
    status: EventStatus.DRAFT,
    visibility: EventVisibility.UNLISTED,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.APPLICATION_BASED,
    startOffsetDays: 35,
    durationHours: 6,
    totalCapacity: 220,
    waitlistEnabled: true,
    scenario: "STANDARD",
  },
  {
    title: "University Club Hack Jam",
    description: "Campus coding challenge under review before publication.",
    status: EventStatus.IN_REVIEW,
    visibility: EventVisibility.UNLISTED,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 30,
    durationHours: 20,
    totalCapacity: 300,
    waitlistEnabled: true,
    scenario: "STANDARD",
  },
  {
    title: "Design Systems Summit",
    description: "Design and engineering collaboration summit with strong speaker lineup.",
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.HYBRID,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 17,
    durationHours: 9,
    totalCapacity: 260,
    waitlistEnabled: true,
    scenario: "STANDARD",
  },
  {
    title: "Community Builder Forum",
    description: "Live forum with active attendee arrivals and community-led sessions.",
    status: EventStatus.LIVE,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.PHYSICAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 0,
    durationHours: 10,
    totalCapacity: 240,
    waitlistEnabled: true,
    scenario: "STANDARD",
  },
  {
    title: "Platform Security Roundtable",
    description: "Completed security and privacy roundtable with compliance follow-ups.",
    status: EventStatus.COMPLETED,
    visibility: EventVisibility.UNLISTED,
    venueMode: VenueMode.VIRTUAL,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: -18,
    durationHours: 3,
    totalCapacity: 120,
    waitlistEnabled: false,
    scenario: "STANDARD",
  },
  {
    title: "Future Commerce Expo",
    description: "Postponed commerce expo awaiting finalized venue logistics.",
    status: EventStatus.POSTPONED,
    visibility: EventVisibility.PUBLIC,
    venueMode: VenueMode.HYBRID,
    registrationType: RegistrationType.OPEN,
    startOffsetDays: 25,
    durationHours: 10,
    totalCapacity: 500,
    waitlistEnabled: true,
    scenario: "STANDARD",
  },
];

export function buildEvents(input: {
  now: Date;
  orgIds: string[];
  organizerIds: string[];
}): EventSeedResult {
  const profiles: SeedEventProfile[] = EVENT_BLUEPRINTS.map((blueprint, index) => {
    const sequence = index + 1;
    const { startAt, endAt } = eventWindow(blueprint.startOffsetDays, blueprint.durationHours);
    const coverImageUrl = sequence <= 10 ? pickCyclic(eventImages, index) : null;
    const galleryImages = sequence % 2 === 0 ? pickCyclic(gallerySets, index) : [];

    return {
      sequence,
      id: ids.event(sequence),
      orgId: pickCyclic(input.orgIds, index),
      createdBy: pickCyclic(input.organizerIds, index),
      title: blueprint.title,
      description: blueprint.description,
      status: blueprint.status,
      visibility: blueprint.visibility,
      venueMode: blueprint.venueMode,
      registrationType: blueprint.registrationType,
      venueName:
        blueprint.venueMode === VenueMode.VIRTUAL
          ? "Online Event"
          : `${blueprint.title.split(" ")[0]} Convention Center`,
      venueAddress:
        blueprint.venueMode === VenueMode.VIRTUAL
          ? null
          : `${20 + sequence} Central Avenue`,
      virtualMeetingUrl:
        blueprint.venueMode === VenueMode.PHYSICAL
          ? null
          : `https://meet.event-demo.local/room/${sequence}`,
      startAt,
      endAt,
      timezone: "Africa/Addis_Ababa",
      totalCapacity: blueprint.totalCapacity,
      waitlistEnabled: blueprint.waitlistEnabled,
      coverImageUrl,
      galleryImages,
      scenario: blueprint.scenario,
    };
  });

  const events: Prisma.EventCreateManyInput[] = profiles.map((profile, index) => ({
    id: profile.id,
    orgId: profile.orgId,
    title: profile.title,
    description: profile.description,
    coverImageUrl: profile.coverImageUrl,
    galleryImages: profile.galleryImages,
    venueMode: profile.venueMode,
    registrationType: profile.registrationType,
    venueName: profile.venueName,
    venueAddress: profile.venueAddress,
    virtualMeetingUrl: profile.virtualMeetingUrl,
    totalCapacity: profile.totalCapacity,
    waitlistEnabled: profile.waitlistEnabled,
    slug: `${profile.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${profile.sequence}`,
    brandingTheme: profile.sequence % 2 === 0 ? "sunrise-orange" : "amber-light",
    brandingLogoUrl: `https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400&auto=format&fit=crop&q=70&sig=${profile.sequence}`,
    brandingPrimaryColor: profile.sequence % 2 === 0 ? "#F97316" : "#EA580C",
    brandingAccentColor: profile.sequence % 2 === 0 ? "#FDBA74" : "#FB923C",
    registrationFormConfig: {
      fields: [
        { key: "fullName", required: true },
        { key: "phone", required: false },
        { key: "company", required: profile.sequence % 3 === 0 },
      ],
    },
    confirmationEmailTemplate: "Thanks for registering. Keep this confirmation for check-in.",
    reminderEmailTemplate: "Your event starts soon. Arrive early for smooth check-in.",
    reminderLeadHours: 24,
    organizerAnnouncementTemplate: "Organizer update: agenda refinements are now published.",
    shareMessage: `Join us at ${profile.title}`,
    referralEnabled: index % 3 === 0,
    referralDefaultCode: index % 3 === 0 ? `REF${1000 + index}` : null,
    campaignTrackingEnabled: true,
    ticketSalesPaused: profile.scenario === "SOLD_OUT",
    status: profile.status,
    visibility: profile.visibility,
    startAt: profile.startAt,
    endAt: profile.endAt,
    timezone: profile.timezone,
    publishAt: addDays(profile.startAt, -10),
    version: 1,
    createdBy: profile.createdBy,
    createdAt: subDays(input.now, 120 - index * 2),
    updatedAt: addHours(profile.startAt, -30),
  }));

  return {
    profiles,
    events,
    scenarioEventIds: {
      soldOut: ids.event(1),
      live: ids.event(2),
      completed: ids.event(3),
      cancelled: ids.event(4),
      privateEvent: ids.event(5),
      virtualEvent: ids.event(6),
    },
  };
}
