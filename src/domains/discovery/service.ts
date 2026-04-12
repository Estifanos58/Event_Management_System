import {
  EventStatus,
  EventVisibility,
  Prisma,
  ReservationStatus,
  RiskSeverity,
  RiskStatus,
  Role,
  ScopeType,
  TicketStatus,
  VenueMode,
} from "@prisma/client";
import { z } from "zod";
import { writeAuditEvent } from "@/core/audit/audit";
import { getServerSessionOrNull } from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import { DiscoveryDomainError } from "@/domains/discovery/errors";
import { findBlockingUserBanForOrganization } from "@/domains/moderation/service";
import type {
  DiscoverableEventDetail,
  DiscoveryAvailabilitySnapshot,
  DiscoveryEventCard,
  DiscoveryEventFeedbackState,
  DiscoveryFeedbackEntry,
  DiscoveryFeedbackEligibility,
  DiscoveryFeedbackInput,
  DiscoveryFeedbackQueryInput,
  DiscoveryFeedbackSummary,
  DiscoveryListResult,
  DiscoveryQueryInput,
  DiscoveryRecommendationInput,
  DiscoveryRecommendationResult,
  DiscoverySort,
  DiscoverySuggestionInput,
  EventReputationSnapshot,
} from "@/domains/discovery/types";

const DISCOVERY_VISIBILITY = [EventVisibility.PUBLIC, EventVisibility.UNLISTED] as const;
const DISCOVERY_LIST_STATUSES = [EventStatus.PUBLISHED, EventStatus.LIVE] as const;
const DISCOVERY_DETAIL_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
  EventStatus.COMPLETED,
  EventStatus.POSTPONED,
  EventStatus.CANCELLED,
] as const;

const SEARCH_SYNONYMS: Record<string, string[]> = {
  concert: ["music", "gig", "live"],
  conference: ["summit", "forum", "convention"],
  meetup: ["networking", "community"],
  webinar: ["virtual", "online", "workshop"],
  expo: ["exhibition", "fair", "showcase"],
  festival: ["celebration", "music", "culture"],
};

const FEEDBACK_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const FEEDBACK_RATE_LIMIT_COUNT = 5;
const FEEDBACK_BURST_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_BURST_LIMIT = 12;
const DUPLICATE_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_REVIEW_THRESHOLD = 3;
const RATING_CLUSTER_WINDOW_MS = 2 * 60 * 60 * 1000;
const RATING_CLUSTER_MIN_COUNT = 8;
const RATING_CLUSTER_RATIO = 0.85;

const discoveryQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    category: z.string().trim().max(80).optional(),
    location: z.string().trim().max(120).optional(),
    organizer: z.string().trim().max(120).optional(),
    eventType: z.enum(VenueMode).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    minRating: z.coerce.number().min(1).max(5).optional(),
    availability: z.enum(["AVAILABLE", "SOLD_OUT"]).optional(),
    sort: z.enum(["relevance", "date", "popularity", "rating", "price"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((payload) => !(payload.dateFrom && payload.dateTo) || payload.dateFrom < payload.dateTo, {
    message: "dateTo must be later than dateFrom.",
    path: ["dateTo"],
  })
  .refine((payload) => !(payload.minPrice !== undefined && payload.maxPrice !== undefined) || payload.minPrice <= payload.maxPrice, {
    message: "maxPrice must be greater than or equal to minPrice.",
    path: ["maxPrice"],
  });

const suggestionQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const feedbackInputSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  reviewText: z.string().trim().max(1_500).optional(),
  tags: z
    .array(z.string().trim().min(2).max(40))
    .max(12)
    .optional(),
});

const feedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(20).optional(),
});

type DiscoveryEventRow = Prisma.EventGetPayload<{
  include: {
    organization: {
      select: {
        id: true;
        displayName: true;
        region: true;
      };
    };
    ticketClasses: {
      select: {
        id: true;
        name: true;
        type: true;
        price: true;
        currency: true;
        capacity: true;
        salesStartAt: true;
        salesEndAt: true;
      };
    };
  };
}>;

type EventSignal = {
  ratingAverage: number;
  ratingCount: number;
  soldTickets: number;
  usedTickets: number;
  attendanceRate: number;
  popularityScore: number;
  reputationScore: number;
  platformScore: number;
};

type UserBehaviorProfile = {
  engagedEventIds: Set<string>;
  preferredVenueModes: Map<VenueMode, number>;
  preferredOrganizerIds: Set<string>;
  interestTokens: Set<string>;
};

type FeedbackEntryRow = Prisma.FeedbackGetPayload<{
  select: {
    id: true;
    userId: true;
    rating: true;
    reviewText: true;
    createdAt: true;
    user: {
      select: {
        id: true;
        name: true;
        image: true;
      };
    };
  };
}>;

function now() {
  return new Date();
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseGalleryImages(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0 && isHttpUrl(item)),
    ),
  );
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value.toString());
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items));
}

function expandSearchTerms(query: string) {
  const baseTokens = tokenize(query);
  const expanded = new Set<string>(baseTokens);

  for (const token of baseTokens) {
    const synonyms = SEARCH_SYNONYMS[token] ?? [];

    for (const synonym of synonyms) {
      expanded.add(synonym.toLowerCase());
      for (const nested of tokenize(synonym)) {
        expanded.add(nested);
      }
    }
  }

  return Array.from(expanded);
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const matrix: number[][] = Array.from({ length: left.length + 1 }, () => []);

  for (let i = 0; i <= left.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function isFuzzyMatch(term: string, word: string) {
  const lengthDelta = Math.abs(term.length - word.length);

  if (lengthDelta > 2) {
    return false;
  }

  const maxDistance = term.length <= 5 ? 1 : 2;
  return levenshteinDistance(term, word) <= maxDistance;
}

function getEventMinPrice(event: DiscoveryEventRow) {
  if (event.ticketClasses.length === 0) {
    return {
      minPrice: null,
      currency: null,
    };
  }

  let minPrice = Number.POSITIVE_INFINITY;
  let currency: string | null = null;

  for (const ticketClass of event.ticketClasses) {
    const price = toNumber(ticketClass.price);

    if (price < minPrice) {
      minPrice = price;
      currency = ticketClass.currency;
    }
  }

  return {
    minPrice: Number.isFinite(minPrice) ? roundCurrency(minPrice) : null,
    currency,
  };
}

function getEventCapacity(event: DiscoveryEventRow) {
  if (event.totalCapacity !== null) {
    return event.totalCapacity;
  }

  const aggregatedCapacity = event.ticketClasses.reduce(
    (sum, ticketClass) => sum + ticketClass.capacity,
    0,
  );

  return aggregatedCapacity > 0 ? aggregatedCapacity : null;
}

function computeReputationScore(input: {
  ratingAverage: number;
  ratingCount: number;
  attendanceRate: number;
}) {
  const ratingComponent = (input.ratingAverage / 5) * 0.6;
  const attendanceComponent = input.attendanceRate * 0.3;
  const confidenceComponent = Math.min(1, input.ratingCount / 30) * 0.1;

  return roundCurrency((ratingComponent + attendanceComponent + confidenceComponent) * 100);
}

function computePlatformScore(input: {
  ratingAverage: number;
  popularityScore: number;
  attendanceRate: number;
  startAt: Date;
}) {
  const ratingComponent = (input.ratingAverage / 5) * 35;
  const popularityComponent = Math.log10(input.popularityScore + 1) * 25;
  const attendanceComponent = input.attendanceRate * 20;

  const hoursUntilStart = (input.startAt.getTime() - now().getTime()) / (60 * 60 * 1000);
  const recencyComponent =
    hoursUntilStart >= 0
      ? Math.max(0, 20 - Math.min(20, hoursUntilStart / 12))
      : Math.max(0, 6 - Math.min(6, Math.abs(hoursUntilStart) / 48));

  return roundCurrency(
    ratingComponent + popularityComponent + attendanceComponent + recencyComponent,
  );
}

async function loadEventSignals(eventIds: string[]) {
  const signalMap = new Map<string, EventSignal>();

  if (eventIds.length === 0) {
    return signalMap;
  }

  const [feedbackAggregate, ticketAggregate] = await Promise.all([
    prisma.feedback.groupBy({
      by: ["eventId"],
      where: {
        eventId: {
          in: eventIds,
        },
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.ticket.groupBy({
      by: ["eventId", "status"],
      where: {
        eventId: {
          in: eventIds,
        },
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  for (const eventId of eventIds) {
    signalMap.set(eventId, {
      ratingAverage: 0,
      ratingCount: 0,
      soldTickets: 0,
      usedTickets: 0,
      attendanceRate: 0,
      popularityScore: 0,
      reputationScore: 0,
      platformScore: 0,
    });
  }

  for (const feedback of feedbackAggregate) {
    const signal = signalMap.get(feedback.eventId);

    if (!signal) {
      continue;
    }

    signal.ratingAverage = roundCurrency(feedback._avg.rating ?? 0);
    signal.ratingCount = feedback._count._all;
  }

  for (const ticket of ticketAggregate) {
    const signal = signalMap.get(ticket.eventId);

    if (!signal) {
      continue;
    }

    signal.soldTickets += ticket._count._all;

    if (ticket.status === TicketStatus.USED) {
      signal.usedTickets += ticket._count._all;
    }
  }

  for (const signal of signalMap.values()) {
    signal.popularityScore = signal.soldTickets;
    signal.attendanceRate =
      signal.soldTickets > 0 ? signal.usedTickets / signal.soldTickets : 0;
    signal.reputationScore = computeReputationScore({
      ratingAverage: signal.ratingAverage,
      ratingCount: signal.ratingCount,
      attendanceRate: signal.attendanceRate,
    });
  }

  return signalMap;
}

function computeRelevanceScore(params: {
  event: DiscoveryEventRow;
  terms: string[];
  platformScore: number;
}) {
  const { event, terms } = params;

  if (terms.length === 0) {
    return params.platformScore;
  }

  const title = (event.title ?? "").toLowerCase();
  const description = (event.description ?? "").toLowerCase();
  const location = `${event.venueName ?? ""} ${event.venueAddress ?? ""} ${event.organization.region}`.toLowerCase();
  const organizer = event.organization.displayName.toLowerCase();
  const combinedWords = uniqueStrings(
    tokenize(`${title} ${description} ${location} ${organizer} ${event.shareMessage ?? ""}`),
  );

  let matched = 0;
  let score = 0;

  for (const term of terms) {
    if (!term) {
      continue;
    }

    if (title.includes(term)) {
      matched += 1;
      score += 9;
      continue;
    }

    if (organizer.includes(term)) {
      matched += 1;
      score += 7;
      continue;
    }

    if (location.includes(term)) {
      matched += 1;
      score += 5;
      continue;
    }

    if (description.includes(term)) {
      matched += 1;
      score += 4;
      continue;
    }

    if (combinedWords.some((word) => isFuzzyMatch(term, word))) {
      matched += 1;
      score += 2;
    }
  }

  if (matched === 0) {
    return 0;
  }

  return roundCurrency(score + params.platformScore * 0.35);
}

function toDiscoveryEventCard(params: {
  event: DiscoveryEventRow;
  signal: EventSignal;
  recommendationScore: number;
  relevanceScore: number;
}): DiscoveryEventCard {
  const { event, signal } = params;
  const { minPrice, currency } = getEventMinPrice(event);
  const totalCapacity = getEventCapacity(event);
  const remainingTickets =
    totalCapacity === null ? null : Math.max(0, totalCapacity - signal.soldTickets);
  const soldOut = event.ticketSalesPaused || (remainingTickets !== null && remainingTickets <= 0);

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    coverImageUrl: event.coverImageUrl,
    galleryImages: parseGalleryImages(event.galleryImages),
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    venueMode: event.venueMode,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    minPrice,
    currency,
    ratingAverage: signal.ratingAverage,
    ratingCount: signal.ratingCount,
    popularityScore: signal.popularityScore,
    attendanceRate: roundCurrency(signal.attendanceRate * 100),
    reputationScore: signal.reputationScore,
    recommendationScore: roundCurrency(Math.max(params.relevanceScore, params.recommendationScore)),
    remainingTickets,
    soldOut,
    organizer: {
      id: event.organization.id,
      name: event.organization.displayName,
      region: event.organization.region,
    },
  };
}

function compareBySort(sort: DiscoverySort, left: DiscoveryEventCard, right: DiscoveryEventCard) {
  if (sort === "date") {
    return new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
  }

  if (sort === "popularity") {
    return right.popularityScore - left.popularityScore;
  }

  if (sort === "rating") {
    if (right.ratingAverage !== left.ratingAverage) {
      return right.ratingAverage - left.ratingAverage;
    }

    return right.ratingCount - left.ratingCount;
  }

  if (sort === "price") {
    const leftPrice = left.minPrice ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.minPrice ?? Number.POSITIVE_INFINITY;
    return leftPrice - rightPrice;
  }

  if (right.recommendationScore !== left.recommendationScore) {
    return right.recommendationScore - left.recommendationScore;
  }

  return new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
}

function parseDiscoveryQueryInput(input: unknown) {
  const parsed = discoveryQuerySchema.parse(input);

  return {
    q: normalizeOptionalText(parsed.q),
    category: normalizeOptionalText(parsed.category),
    location: normalizeOptionalText(parsed.location),
    organizer: normalizeOptionalText(parsed.organizer),
    eventType: parsed.eventType,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    minRating: parsed.minRating,
    availability: parsed.availability,
    sort: parsed.sort ?? "relevance",
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 12,
  };
}

function parseSuggestionInput(input: unknown) {
  const parsed = suggestionQuerySchema.parse(input);

  return {
    q: normalizeOptionalText(parsed.q),
    limit: parsed.limit ?? 8,
  };
}

function parseRecommendationInput(input: unknown) {
  const parsed = recommendationQuerySchema.parse(input);

  return {
    limit: parsed.limit ?? 8,
  };
}

function parseFeedbackInput(input: unknown) {
  const parsed = feedbackInputSchema.parse(input);

  return {
    rating: parsed.rating,
    reviewText: normalizeOptionalText(parsed.reviewText),
    tags: uniqueStrings((parsed.tags ?? []).map((tag) => tag.trim().toLowerCase())),
  };
}

function parseFeedbackQueryInput(input: DiscoveryFeedbackQueryInput | undefined) {
  const parsed = feedbackQuerySchema.parse(input ?? {});

  return {
    page: parsed.page ?? 1,
    pageSize: parsed.pageSize ?? 10,
  };
}

function buildDiscoveryWhereClause(input: ReturnType<typeof parseDiscoveryQueryInput>) {
  const where: Prisma.EventWhereInput = {
    status: {
      in: [...DISCOVERY_LIST_STATUSES],
    },
    visibility: {
      in: [...DISCOVERY_VISIBILITY],
    },
    ticketSalesPaused: false,
  };

  if (input.eventType) {
    where.venueMode = input.eventType;
  }

  if (input.dateFrom || input.dateTo) {
    where.startAt = {
      ...(input.dateFrom ? { gte: input.dateFrom } : {}),
      ...(input.dateTo ? { lte: input.dateTo } : {}),
    };
  }

  const andClauses: Prisma.EventWhereInput[] = [];

  if (input.location) {
    andClauses.push({
      OR: [
        {
          venueName: {
            contains: input.location,
            mode: "insensitive",
          },
        },
        {
          venueAddress: {
            contains: input.location,
            mode: "insensitive",
          },
        },
        {
          organization: {
            region: {
              contains: input.location,
              mode: "insensitive",
            },
          },
        },
      ],
    });
  }

  if (input.organizer) {
    andClauses.push({
      organization: {
        displayName: {
          contains: input.organizer,
          mode: "insensitive",
        },
      },
    });
  }

  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    andClauses.push({
      ticketClasses: {
        some: {
          ...(input.minPrice !== undefined ? { price: { gte: input.minPrice } } : {}),
          ...(input.maxPrice !== undefined ? { price: { lte: input.maxPrice } } : {}),
        },
      },
    });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}

async function loadDiscoveryEvents(input: ReturnType<typeof parseDiscoveryQueryInput>) {
  const candidateTake = Math.min(400, Math.max(input.pageSize * 8, 120));

  return prisma.event.findMany({
    where: buildDiscoveryWhereClause(input),
    include: {
      organization: {
        select: {
          id: true,
          displayName: true,
          region: true,
        },
      },
      ticketClasses: {
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          currency: true,
          capacity: true,
          salesStartAt: true,
          salesEndAt: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
    take: candidateTake,
  });
}

async function getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile> {
  const [tickets, feedbacks] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        OR: [{ ownerId: userId }, { attendeeId: userId }],
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      select: {
        eventId: true,
        event: {
          select: {
            orgId: true,
            venueMode: true,
            title: true,
            description: true,
          },
        },
      },
      take: 200,
    }),
    prisma.feedback.findMany({
      where: {
        userId,
      },
      select: {
        tags: true,
      },
      take: 100,
    }),
  ]);

  const engagedEventIds = new Set<string>();
  const preferredVenueModes = new Map<VenueMode, number>();
  const preferredOrganizerIds = new Set<string>();
  const interestTokens = new Set<string>();

  for (const ticket of tickets) {
    engagedEventIds.add(ticket.eventId);
    preferredOrganizerIds.add(ticket.event.orgId);

    const existingModeWeight = preferredVenueModes.get(ticket.event.venueMode) ?? 0;
    preferredVenueModes.set(ticket.event.venueMode, existingModeWeight + 1);

    for (const token of tokenize(`${ticket.event.title} ${ticket.event.description ?? ""}`)) {
      interestTokens.add(token);
    }
  }

  for (const feedback of feedbacks) {
    if (!Array.isArray(feedback.tags)) {
      continue;
    }

    for (const value of feedback.tags) {
      if (typeof value !== "string") {
        continue;
      }

      for (const token of tokenize(value)) {
        interestTokens.add(token);
      }
    }
  }

  return {
    engagedEventIds,
    preferredVenueModes,
    preferredOrganizerIds,
    interestTokens,
  };
}

function scoreRecommendation(
  event: DiscoveryEventRow,
  card: DiscoveryEventCard,
  profile: UserBehaviorProfile | null,
) {
  let score = card.recommendationScore;
  const reasons: string[] = [];

  if (!profile) {
    if (card.ratingAverage >= 4) {
      reasons.push("High attendee rating");
    }

    if (card.popularityScore > 0) {
      reasons.push("Popular event in the platform");
    }

    return {
      score,
      reasons,
    };
  }

  if (profile.engagedEventIds.has(event.id)) {
    score -= 20;
    reasons.push("Already in your attended or purchased history");
  }

  const venueModeWeight = profile.preferredVenueModes.get(event.venueMode) ?? 0;

  if (venueModeWeight > 0) {
    score += Math.min(14, venueModeWeight * 2);
    reasons.push(`Matches your ${event.venueMode.toLowerCase()} event preference`);
  }

  if (profile.preferredOrganizerIds.has(event.orgId)) {
    score += 10;
    reasons.push("From an organizer you have engaged with");
  }

  const eventTokens = new Set(
    tokenize(
      `${event.title} ${event.description ?? ""} ${event.venueName ?? ""} ${event.venueAddress ?? ""}`,
    ),
  );
  let tokenOverlap = 0;

  for (const token of profile.interestTokens) {
    if (eventTokens.has(token)) {
      tokenOverlap += 1;
    }
  }

  if (tokenOverlap > 0) {
    score += Math.min(18, tokenOverlap * 3);
    reasons.push("Aligned with your historical interests");
  }

  if (reasons.length === 0) {
    reasons.push("Strong platform quality and engagement signals");
  }

  return {
    score: roundCurrency(score),
    reasons,
  };
}

function normalizeReviewText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDominantRatingRatio(ratings: number[]) {
  if (ratings.length === 0) {
    return 0;
  }

  const distribution = new Map<number, number>();

  for (const rating of ratings) {
    distribution.set(rating, (distribution.get(rating) ?? 0) + 1);
  }

  let dominantCount = 0;

  for (const count of distribution.values()) {
    if (count > dominantCount) {
      dominantCount = count;
    }
  }

  return dominantCount / ratings.length;
}

async function createDiscoveryRiskCaseIfMissing(input: {
  eventId: string;
  organizationId: string;
  source: string;
  severity: RiskSeverity;
  createdBy: string;
}) {
  const existingRiskCase = await prisma.riskCase.findFirst({
    where: {
      eventId: input.eventId,
      source: input.source,
      status: {
        in: [RiskStatus.OPEN, RiskStatus.INVESTIGATING],
      },
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
    },
  });

  if (existingRiskCase) {
    return existingRiskCase;
  }

  return prisma.riskCase.create({
    data: {
      scopeType: ScopeType.EVENT,
      scopeId: input.eventId,
      source: input.source,
      severity: input.severity,
      status: RiskStatus.OPEN,
      eventId: input.eventId,
      organizationId: input.organizationId,
      createdBy: input.createdBy,
    },
    select: {
      id: true,
    },
  });
}

async function enforceFeedbackSafetyGuards(
  eventId: string,
  userId: string,
  input: {
    rating: number;
    reviewText?: string;
  },
) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
      createdBy: true,
    },
  });

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const organizerBinding = await prisma.roleBinding.findFirst({
    where: {
      userId,
      role: Role.ORGANIZER,
      OR: [
        {
          scopeType: ScopeType.EVENT,
          scopeId: eventId,
        },
        {
          scopeType: ScopeType.ORGANIZATION,
          scopeId: event.orgId,
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (event.createdBy === userId || organizerBinding) {
    throw new DiscoveryDomainError(
      403,
      "SELF_REVIEW_FORBIDDEN",
      "Organizers cannot submit feedback on their own events.",
    );
  }

  const [recentFeedbackAuditCount, recentFeedbackCount] = await Promise.all([
    prisma.auditEvent.count({
      where: {
        actorId: userId,
        action: {
          in: ["feedback.submitted", "feedback.updated"],
        },
        createdAt: {
          gte: new Date(Date.now() - FEEDBACK_RATE_LIMIT_WINDOW_MS),
        },
      },
    }),
    prisma.feedback.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - FEEDBACK_BURST_WINDOW_MS),
        },
      },
    }),
  ]);

  if (recentFeedbackAuditCount >= FEEDBACK_RATE_LIMIT_COUNT) {
    throw new DiscoveryDomainError(
      429,
      "RATE_LIMITED",
      "Feedback submission rate limit exceeded. Please wait before posting again.",
    );
  }

  if (recentFeedbackCount >= FEEDBACK_BURST_LIMIT) {
    await createDiscoveryRiskCaseIfMissing({
      eventId,
      organizationId: event.orgId,
      source: "REVIEW_SPAM_BURST",
      severity: RiskSeverity.HIGH,
      createdBy: userId,
    });

    throw new DiscoveryDomainError(
      429,
      "RATE_LIMITED",
      "Feedback posting velocity appears abusive. Please try again later.",
    );
  }

  if (input.reviewText) {
    const normalizedIncomingReview = normalizeReviewText(input.reviewText);

    if (normalizedIncomingReview.length >= 12) {
      const recentEventReviews = await prisma.feedback.findMany({
        where: {
          eventId,
          reviewText: {
            not: null,
          },
          createdAt: {
            gte: new Date(Date.now() - DUPLICATE_REVIEW_WINDOW_MS),
          },
        },
        select: {
          userId: true,
          reviewText: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 200,
      });

      let duplicateReviewCount = 0;

      for (const review of recentEventReviews) {
        if (review.userId === userId || !review.reviewText) {
          continue;
        }

        if (normalizeReviewText(review.reviewText) === normalizedIncomingReview) {
          duplicateReviewCount += 1;
        }
      }

      if (duplicateReviewCount >= DUPLICATE_REVIEW_THRESHOLD) {
        await createDiscoveryRiskCaseIfMissing({
          eventId,
          organizationId: event.orgId,
          source: "REVIEW_TEXT_DUPLICATION",
          severity: RiskSeverity.MEDIUM,
          createdBy: userId,
        });

        throw new DiscoveryDomainError(
          422,
          "SPAM_DETECTED",
          "Review text appears duplicated across multiple submissions.",
        );
      }
    }
  }

  const recentEventRatings = await prisma.feedback.findMany({
    where: {
      eventId,
      createdAt: {
        gte: new Date(Date.now() - RATING_CLUSTER_WINDOW_MS),
      },
    },
    select: {
      rating: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  const ratingSeries = [...recentEventRatings.map((feedback) => feedback.rating), input.rating];
  const dominantRatingRatio = getDominantRatingRatio(ratingSeries);

  if (
    ratingSeries.length >= RATING_CLUSTER_MIN_COUNT &&
    dominantRatingRatio >= RATING_CLUSTER_RATIO
  ) {
    await createDiscoveryRiskCaseIfMissing({
      eventId,
      organizationId: event.orgId,
      source: "RATING_MANIPULATION_CLUSTER",
      severity: RiskSeverity.HIGH,
      createdBy: userId,
    });
  }
}

async function getFeedbackEligibilityForUser(eventId: string, userId: string): Promise<DiscoveryFeedbackEligibility> {
  const [event, usedTicket, existingFeedback] = await Promise.all([
    prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        orgId: true,
        status: true,
        endAt: true,
      },
    }),
    prisma.ticket.findFirst({
      where: {
        eventId,
        status: TicketStatus.USED,
        OR: [{ ownerId: userId }, { attendeeId: userId }],
      },
      select: {
        id: true,
      },
    }),
    prisma.feedback.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const blockingBan = await findBlockingUserBanForOrganization(event.orgId, userId);

  if (blockingBan) {
    return {
      eligible: false,
      reasonCode: "BANNED",
      reason: "You are currently restricted from posting feedback for this event.",
      alreadySubmitted: Boolean(existingFeedback),
    };
  }

  if (event.endAt.getTime() > now().getTime() && event.status !== EventStatus.COMPLETED && event.status !== EventStatus.ARCHIVED) {
    return {
      eligible: false,
      reasonCode: "EVENT_NOT_COMPLETED",
      reason: "Feedback can be submitted only after the event has concluded.",
      alreadySubmitted: Boolean(existingFeedback),
    };
  }

  if (!usedTicket) {
    return {
      eligible: false,
      reasonCode: "ATTENDANCE_REQUIRED",
      reason: "Only attendees with redeemed tickets can submit feedback.",
      alreadySubmitted: Boolean(existingFeedback),
    };
  }

  return {
    eligible: true,
    reasonCode: "ELIGIBLE",
    reason: existingFeedback
      ? "You have already submitted feedback and can update it."
      : "You are eligible to submit feedback.",
    alreadySubmitted: Boolean(existingFeedback),
  };
}

async function getFeedbackSummary(eventId: string): Promise<DiscoveryFeedbackSummary> {
  const [aggregate, feedbacks] = await Promise.all([
    prisma.feedback.aggregate({
      where: {
        eventId,
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.feedback.findMany({
      where: {
        eventId,
      },
      select: {
        tags: true,
      },
      take: 200,
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const tagCountMap = new Map<string, number>();

  for (const feedback of feedbacks) {
    if (!Array.isArray(feedback.tags)) {
      continue;
    }

    for (const value of feedback.tags) {
      if (typeof value !== "string") {
        continue;
      }

      const normalizedTag = value.trim().toLowerCase();

      if (!normalizedTag) {
        continue;
      }

      tagCountMap.set(normalizedTag, (tagCountMap.get(normalizedTag) ?? 0) + 1);
    }
  }

  const tagFrequency = Array.from(tagCountMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  return {
    eventId,
    ratingAverage: roundCurrency(aggregate._avg.rating ?? 0),
    ratingCount: aggregate._count._all,
    tagFrequency,
  };
}

function toDiscoveryFeedbackEntry(feedback: FeedbackEntryRow): DiscoveryFeedbackEntry {
  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: feedback.user.name,
    userImageUrl: feedback.user.image,
    rating: feedback.rating,
    reviewText: feedback.reviewText,
    createdAt: feedback.createdAt.toISOString(),
  };
}

async function listEventFeedbackEntriesPage(
  eventId: string,
  input: { page: number; pageSize: number },
) {
  const total = await prisma.feedback.count({
    where: {
      eventId,
    },
  });

  const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, totalPages);
  const skip = (page - 1) * input.pageSize;

  const feedbacks = await prisma.feedback.findMany({
    where: {
      eventId,
    },
    select: {
      id: true,
      userId: true,
      rating: true,
      reviewText: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: input.pageSize,
  });

  return {
    entries: feedbacks.map((feedback) => toDiscoveryFeedbackEntry(feedback)),
    page,
    pageSize: input.pageSize,
    total,
    totalPages,
  };
}

async function getViewerFeedbackEntry(
  eventId: string,
  userId: string,
): Promise<DiscoveryFeedbackEntry | null> {
  const feedback = await prisma.feedback.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId,
      },
    },
    select: {
      id: true,
      userId: true,
      rating: true,
      reviewText: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  return feedback ? toDiscoveryFeedbackEntry(feedback) : null;
}

async function buildEventFeedbackState(
  eventId: string,
  userId: string | null,
  query: { page: number; pageSize: number },
): Promise<DiscoveryEventFeedbackState> {
  const [feedbackSummary, entriesPage] = await Promise.all([
    getFeedbackSummary(eventId),
    listEventFeedbackEntriesPage(eventId, query),
  ]);

  if (!userId) {
    return {
      feedbackSummary,
      feedbackEligibility: {
        eligible: false,
        reasonCode: "SIGN_IN_REQUIRED",
        reason: "Sign in to check feedback eligibility.",
        alreadySubmitted: false,
      },
      entries: entriesPage.entries,
      entryPagination: {
        page: entriesPage.page,
        pageSize: entriesPage.pageSize,
        total: entriesPage.total,
        totalPages: entriesPage.totalPages,
      },
      viewerFeedback: null,
    };
  }

  const [feedbackEligibility, viewerFeedback] = await Promise.all([
    getFeedbackEligibilityForUser(eventId, userId),
    getViewerFeedbackEntry(eventId, userId),
  ]);

  return {
    feedbackSummary,
    feedbackEligibility,
    entries: entriesPage.entries,
    entryPagination: {
      page: entriesPage.page,
      pageSize: entriesPage.pageSize,
      total: entriesPage.total,
      totalPages: entriesPage.totalPages,
    },
    viewerFeedback,
  };
}

async function getEventReputationSnapshot(eventId: string): Promise<EventReputationSnapshot> {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      orgId: true,
    },
  });

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const eventSignalMap = await loadEventSignals([eventId]);
  const eventSignal = eventSignalMap.get(eventId) ?? {
    ratingAverage: 0,
    ratingCount: 0,
    soldTickets: 0,
    usedTickets: 0,
    attendanceRate: 0,
    popularityScore: 0,
    reputationScore: 0,
    platformScore: 0,
  };

  const [organizerRatingAggregate, organizerTicketAggregate] = await Promise.all([
    prisma.feedback.aggregate({
      where: {
        event: {
          orgId: event.orgId,
        },
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: {
        event: {
          orgId: event.orgId,
        },
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  let organizerSold = 0;
  let organizerUsed = 0;

  for (const item of organizerTicketAggregate) {
    organizerSold += item._count._all;

    if (item.status === TicketStatus.USED) {
      organizerUsed += item._count._all;
    }
  }

  const organizerAttendanceRate = organizerSold > 0 ? organizerUsed / organizerSold : 0;
  const organizerReputationScore = computeReputationScore({
    ratingAverage: roundCurrency(organizerRatingAggregate._avg.rating ?? 0),
    ratingCount: organizerRatingAggregate._count._all,
    attendanceRate: organizerAttendanceRate,
  });

  return {
    eventId,
    eventReputationScore: eventSignal.reputationScore,
    organizerReputationScore,
    ratingAverage: eventSignal.ratingAverage,
    ratingCount: eventSignal.ratingCount,
    attendanceRate: roundCurrency(eventSignal.attendanceRate * 100),
  };
}

export async function listDiscoverableEvents(input: DiscoveryQueryInput): Promise<DiscoveryListResult> {
  const parsedInput = parseDiscoveryQueryInput(input);
  const events = await loadDiscoveryEvents(parsedInput);
  const signalMap = await loadEventSignals(events.map((event) => event.id));

  const queryTermSeed = [parsedInput.q, parsedInput.category].filter(
    (value): value is string => Boolean(value),
  );
  const normalizedTerms = uniqueStrings(queryTermSeed.flatMap((term) => expandSearchTerms(term)));

  const cards: DiscoveryEventCard[] = [];

  for (const event of events) {
    const signal = signalMap.get(event.id) ?? {
      ratingAverage: 0,
      ratingCount: 0,
      soldTickets: 0,
      usedTickets: 0,
      attendanceRate: 0,
      popularityScore: 0,
      reputationScore: 0,
      platformScore: 0,
    };

    signal.platformScore = computePlatformScore({
      ratingAverage: signal.ratingAverage,
      popularityScore: signal.popularityScore,
      attendanceRate: signal.attendanceRate,
      startAt: event.startAt,
    });

    const relevanceScore = computeRelevanceScore({
      event,
      terms: normalizedTerms,
      platformScore: signal.platformScore,
    });

    if (normalizedTerms.length > 0 && relevanceScore <= 0) {
      continue;
    }

    const card = toDiscoveryEventCard({
      event,
      signal,
      recommendationScore: signal.platformScore,
      relevanceScore,
    });

    if (parsedInput.minRating !== undefined && card.ratingAverage < parsedInput.minRating) {
      continue;
    }

    if (parsedInput.availability === "AVAILABLE" && card.soldOut) {
      continue;
    }

    if (parsedInput.availability === "SOLD_OUT" && !card.soldOut) {
      continue;
    }

    if (parsedInput.minPrice !== undefined && (card.minPrice ?? 0) < parsedInput.minPrice) {
      continue;
    }

    if (parsedInput.maxPrice !== undefined && card.minPrice !== null && card.minPrice > parsedInput.maxPrice) {
      continue;
    }

    cards.push(card);
  }

  cards.sort((left, right) => compareBySort(parsedInput.sort, left, right));

  const total = cards.length;
  const startIndex = (parsedInput.page - 1) * parsedInput.pageSize;
  const pageItems = cards.slice(startIndex, startIndex + parsedInput.pageSize);

  return {
    items: pageItems,
    total,
    page: parsedInput.page,
    pageSize: parsedInput.pageSize,
    query: {
      sort: parsedInput.sort,
      normalizedTerms,
    },
  };
}

export async function getEventAvailabilitySnapshot(
  eventId: string,
): Promise<DiscoveryAvailabilitySnapshot> {
  const [event, soldTickets, activeHolds] = await Promise.all([
    prisma.event.findFirst({
      where: {
        id: eventId,
        visibility: {
          in: [...DISCOVERY_VISIBILITY],
        },
        status: {
          in: [...DISCOVERY_DETAIL_STATUSES],
        },
      },
      include: {
        ticketClasses: {
          select: {
            capacity: true,
          },
        },
      },
    }),
    prisma.ticket.count({
      where: {
        eventId,
        status: {
          in: [TicketStatus.VALID, TicketStatus.USED],
        },
      },
    }),
    prisma.reservationItem.aggregate({
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

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const totalCapacity =
    event.totalCapacity ??
    (() => {
      const summed = event.ticketClasses.reduce((sum, ticketClass) => sum + ticketClass.capacity, 0);
      return summed > 0 ? summed : null;
    })();
  const activeHoldCount = activeHolds._sum.quantity ?? 0;
  const remainingTickets =
    totalCapacity === null
      ? null
      : Math.max(0, totalCapacity - soldTickets - activeHoldCount);
  const soldOut =
    event.ticketSalesPaused ||
    (remainingTickets !== null && remainingTickets <= 0) ||
    event.status === EventStatus.CANCELLED;

  const displayLabel = soldOut
    ? "Sold out"
    : remainingTickets === null
      ? "Tickets available"
      : `${remainingTickets} tickets left`;

  return {
    eventId,
    updatedAt: now().toISOString(),
    totalCapacity,
    soldTickets,
    activeHolds: activeHoldCount,
    remainingTickets,
    soldOut,
    ticketSalesPaused: event.ticketSalesPaused,
    displayLabel,
  };
}

export async function getDiscoverableEventDetail(
  eventId: string,
): Promise<DiscoverableEventDetail | null> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      visibility: {
        in: [...DISCOVERY_VISIBILITY],
      },
      status: {
        in: [...DISCOVERY_DETAIL_STATUSES],
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          displayName: true,
          region: true,
        },
      },
      eventSessions: {
        where: {
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          room: true,
        },
        orderBy: {
          startAt: "asc",
        },
      },
      ticketClasses: {
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          currency: true,
          capacity: true,
          salesStartAt: true,
          salesEndAt: true,
        },
        orderBy: {
          price: "asc",
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  const session = await getServerSessionOrNull().catch(() => null);

  const [availability, feedbackState, reputation] = await Promise.all([
    getEventAvailabilitySnapshot(event.id),
    buildEventFeedbackState(
      event.id,
      session?.user.id ?? null,
      parseFeedbackQueryInput(undefined),
    ),
    getEventReputationSnapshot(event.id),
  ]);

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    coverImageUrl: event.coverImageUrl,
    galleryImages: parseGalleryImages(event.galleryImages),
    venueMode: event.venueMode,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    virtualMeetingUrl: event.virtualMeetingUrl,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    timezone: event.timezone,
    visibility: event.visibility as "PUBLIC" | "UNLISTED",
    organizer: {
      id: event.organization.id,
      name: event.organization.displayName,
      region: event.organization.region,
    },
    sessions: event.eventSessions.map((session) => ({
      id: session.id,
      title: session.title,
      startAt: session.startAt.toISOString(),
      endAt: session.endAt.toISOString(),
      room: session.room,
    })),
    ticketClasses: event.ticketClasses.map((ticketClass) => ({
      id: ticketClass.id,
      name: ticketClass.name,
      type: ticketClass.type,
      price: roundCurrency(toNumber(ticketClass.price)),
      currency: ticketClass.currency,
      salesStartAt: ticketClass.salesStartAt.toISOString(),
      salesEndAt: ticketClass.salesEndAt.toISOString(),
      capacity: ticketClass.capacity,
    })),
    availability,
    feedbackSummary: feedbackState.feedbackSummary,
    feedbackEligibility: feedbackState.feedbackEligibility,
    feedbackEntries: feedbackState.entries,
    feedbackEntryPagination: feedbackState.entryPagination,
    viewerFeedback: feedbackState.viewerFeedback,
    reputation,
  };
}

export async function getDiscoverySuggestions(input: DiscoverySuggestionInput) {
  const parsedInput = parseSuggestionInput(input);

  if (!parsedInput.q) {
    return {
      suggestions: [],
      normalizedTerms: [],
    };
  }

  const normalizedQuery = parsedInput.q.toLowerCase();
  const expandedTerms = expandSearchTerms(parsedInput.q);

  const events = await prisma.event.findMany({
    where: {
      status: {
        in: [...DISCOVERY_LIST_STATUSES],
      },
      visibility: {
        in: [...DISCOVERY_VISIBILITY],
      },
      OR: [
        {
          title: {
            contains: parsedInput.q,
            mode: "insensitive",
          },
        },
        {
          organization: {
            displayName: {
              contains: parsedInput.q,
              mode: "insensitive",
            },
          },
        },
      ],
    },
    select: {
      title: true,
      organization: {
        select: {
          displayName: true,
        },
      },
    },
    take: 40,
  });

  const phraseSet = new Set<string>();

  for (const event of events) {
    phraseSet.add(event.title);
    phraseSet.add(event.organization.displayName);
  }

  for (const term of expandedTerms) {
    if (term.startsWith(normalizedQuery) || normalizedQuery.startsWith(term)) {
      phraseSet.add(term);
    }

    for (const [root, synonyms] of Object.entries(SEARCH_SYNONYMS)) {
      if (root.startsWith(normalizedQuery)) {
        phraseSet.add(root);
      }

      if (root === term) {
        for (const synonym of synonyms) {
          phraseSet.add(synonym);
        }
      }
    }
  }

  const scored = Array.from(phraseSet)
    .map((phrase) => {
      const normalizedPhrase = phrase.toLowerCase();
      let score = 0;

      if (normalizedPhrase.startsWith(normalizedQuery)) {
        score += 5;
      } else if (normalizedPhrase.includes(normalizedQuery)) {
        score += 3;
      }

      const phraseTokens = tokenize(normalizedPhrase);

      if (phraseTokens.some((token) => isFuzzyMatch(normalizedQuery, token))) {
        score += 2;
      }

      for (const term of expandedTerms) {
        if (normalizedPhrase.includes(term)) {
          score += 1;
        }
      }

      return {
        phrase,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase))
    .slice(0, parsedInput.limit)
    .map((item) => item.phrase);

  return {
    suggestions: scored,
    normalizedTerms: expandedTerms,
  };
}

export async function getDiscoveryRecommendations(
  input: DiscoveryRecommendationInput,
): Promise<DiscoveryRecommendationResult> {
  const parsedInput = parseRecommendationInput(input);
  const session = await getServerSessionOrNull().catch(() => null);

  const events = await prisma.event.findMany({
    where: {
      status: {
        in: [...DISCOVERY_LIST_STATUSES],
      },
      visibility: {
        in: [...DISCOVERY_VISIBILITY],
      },
      ticketSalesPaused: false,
    },
    include: {
      organization: {
        select: {
          id: true,
          displayName: true,
          region: true,
        },
      },
      ticketClasses: {
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          currency: true,
          capacity: true,
          salesStartAt: true,
          salesEndAt: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
    take: 180,
  });

  const signalMap = await loadEventSignals(events.map((event) => event.id));
  const profile = session ? await getUserBehaviorProfile(session.user.id) : null;
  const recommendations = events
    .map((event) => {
      const signal = signalMap.get(event.id) ?? {
        ratingAverage: 0,
        ratingCount: 0,
        soldTickets: 0,
        usedTickets: 0,
        attendanceRate: 0,
        popularityScore: 0,
        reputationScore: 0,
        platformScore: 0,
      };

      signal.platformScore = computePlatformScore({
        ratingAverage: signal.ratingAverage,
        popularityScore: signal.popularityScore,
        attendanceRate: signal.attendanceRate,
        startAt: event.startAt,
      });

      const card = toDiscoveryEventCard({
        event,
        signal,
        recommendationScore: signal.platformScore,
        relevanceScore: signal.platformScore,
      });
      const scored = scoreRecommendation(event, card, profile);

      return {
        event: {
          ...card,
          recommendationScore: scored.score,
        },
        reasons: scored.reasons,
      };
    })
    .filter((item) => !item.event.soldOut)
    .sort((left, right) => right.event.recommendationScore - left.event.recommendationScore)
    .slice(0, parsedInput.limit);

  return {
    recommendations,
    personalized: Boolean(profile && profile.interestTokens.size > 0),
  };
}

export async function getEventFeedbackStatus(
  eventId: string,
  query?: DiscoveryFeedbackQueryInput,
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      visibility: {
        in: [...DISCOVERY_VISIBILITY],
      },
      status: {
        in: [...DISCOVERY_DETAIL_STATUSES],
      },
    },
    select: {
      id: true,
    },
  });

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const session = await getServerSessionOrNull().catch(() => null);

  return buildEventFeedbackState(
    eventId,
    session?.user.id ?? null,
    parseFeedbackQueryInput(query),
  );
}

export async function submitEventFeedback(eventId: string, input: DiscoveryFeedbackInput) {
  const parsedInput = parseFeedbackInput(input);
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new DiscoveryDomainError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const [event, eligibility] = await Promise.all([
    prisma.event.findFirst({
      where: {
        id: eventId,
        visibility: {
          in: [...DISCOVERY_VISIBILITY],
        },
        status: {
          in: [...DISCOVERY_DETAIL_STATUSES],
        },
      },
      select: {
        id: true,
      },
    }),
    getFeedbackEligibilityForUser(eventId, session.user.id),
  ]);

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  if (!eligibility.eligible) {
    throw new DiscoveryDomainError(403, "NOT_ELIGIBLE", eligibility.reason);
  }

  await enforceFeedbackSafetyGuards(eventId, session.user.id, {
    rating: parsedInput.rating,
    reviewText: parsedInput.reviewText,
  });

  const existingFeedback = await prisma.feedback.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId: session.user.id,
      },
    },
    select: {
      id: true,
      rating: true,
      reviewText: true,
      tags: true,
    },
  });

  const feedback = await prisma.feedback.upsert({
    where: {
      eventId_userId: {
        eventId,
        userId: session.user.id,
      },
    },
    update: {
      rating: parsedInput.rating,
      reviewText: parsedInput.reviewText,
      tags: parsedInput.tags,
    },
    create: {
      eventId,
      userId: session.user.id,
      rating: parsedInput.rating,
      reviewText: parsedInput.reviewText,
      tags: parsedInput.tags,
    },
  });

  const reputation = await getEventReputationSnapshot(eventId);

  await writeAuditEvent({
    actorId: session.user.id,
    action: existingFeedback ? "feedback.updated" : "feedback.submitted",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Feedback",
    targetId: feedback.id,
    oldValue: existingFeedback
      ? {
          rating: existingFeedback.rating,
          reviewText: existingFeedback.reviewText,
          tags: existingFeedback.tags,
        }
      : undefined,
    newValue: {
      rating: feedback.rating,
      reviewText: feedback.reviewText,
      tags: feedback.tags,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "reputation.event.recalculated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    newValue: {
      eventReputationScore: reputation.eventReputationScore,
      organizerReputationScore: reputation.organizerReputationScore,
      ratingAverage: reputation.ratingAverage,
      ratingCount: reputation.ratingCount,
      attendanceRate: reputation.attendanceRate,
    },
  });

  return {
    feedback,
    reputation,
  };
}

export async function deleteMyEventFeedback(eventId: string) {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new DiscoveryDomainError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      visibility: {
        in: [...DISCOVERY_VISIBILITY],
      },
      status: {
        in: [...DISCOVERY_DETAIL_STATUSES],
      },
    },
    select: {
      id: true,
    },
  });

  if (!event) {
    throw new DiscoveryDomainError(404, "EVENT_NOT_FOUND", "Event not found.");
  }

  const existingFeedback = await prisma.feedback.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId: session.user.id,
      },
    },
    select: {
      id: true,
      rating: true,
      reviewText: true,
      tags: true,
    },
  });

  if (!existingFeedback) {
    throw new DiscoveryDomainError(404, "FEEDBACK_NOT_FOUND", "Feedback not found.");
  }

  await prisma.feedback.delete({
    where: {
      eventId_userId: {
        eventId,
        userId: session.user.id,
      },
    },
  });

  const reputation = await getEventReputationSnapshot(eventId);

  await writeAuditEvent({
    actorId: session.user.id,
    action: "feedback.deleted",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Feedback",
    targetId: existingFeedback.id,
    oldValue: {
      rating: existingFeedback.rating,
      reviewText: existingFeedback.reviewText,
      tags: existingFeedback.tags,
    },
  });

  await writeAuditEvent({
    actorId: session.user.id,
    action: "reputation.event.recalculated",
    scopeType: ScopeType.EVENT,
    scopeId: eventId,
    targetType: "Event",
    targetId: eventId,
    newValue: {
      eventReputationScore: reputation.eventReputationScore,
      organizerReputationScore: reputation.organizerReputationScore,
      ratingAverage: reputation.ratingAverage,
      ratingCount: reputation.ratingCount,
      attendanceRate: reputation.attendanceRate,
    },
  });

  return {
    deletedFeedbackId: existingFeedback.id,
    reputation,
  };
}
