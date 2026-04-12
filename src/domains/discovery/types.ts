import { VenueMode } from "@prisma/client";

export type DiscoverySort = "relevance" | "date" | "popularity" | "rating" | "price";

export type DiscoveryAvailabilityFilter = "AVAILABLE" | "SOLD_OUT";

export type DiscoveryQueryInput = {
  q?: unknown;
  category?: unknown;
  location?: unknown;
  organizer?: unknown;
  eventType?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  minPrice?: unknown;
  maxPrice?: unknown;
  minRating?: unknown;
  availability?: unknown;
  sort?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type DiscoverySuggestionInput = {
  q?: unknown;
  limit?: unknown;
};

export type DiscoveryRecommendationInput = {
  limit?: unknown;
};

export type DiscoveryFeedbackInput = {
  rating?: unknown;
  reviewText?: unknown;
  tags?: unknown;
};

export type DiscoveryFeedbackQueryInput = {
  page?: unknown;
  pageSize?: unknown;
};

export type DiscoveryEventCard = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  coverImageUrl: string | null;
  galleryImages: string[];
  startAt: string;
  endAt: string;
  venueMode: VenueMode;
  venueName: string | null;
  venueAddress: string | null;
  minPrice: number | null;
  currency: string | null;
  ratingAverage: number;
  ratingCount: number;
  popularityScore: number;
  attendanceRate: number;
  reputationScore: number;
  recommendationScore: number;
  remainingTickets: number | null;
  soldOut: boolean;
  organizer: {
    id: string;
    name: string;
    region: string;
  };
};

export type DiscoveryListResult = {
  items: DiscoveryEventCard[];
  total: number;
  page: number;
  pageSize: number;
  query: {
    sort: DiscoverySort;
    normalizedTerms: string[];
  };
};

export type DiscoveryAvailabilitySnapshot = {
  eventId: string;
  updatedAt: string;
  totalCapacity: number | null;
  soldTickets: number;
  activeHolds: number;
  remainingTickets: number | null;
  soldOut: boolean;
  ticketSalesPaused: boolean;
  displayLabel: string;
};

export type DiscoveryRecommendation = {
  event: DiscoveryEventCard;
  reasons: string[];
};

export type DiscoveryRecommendationResult = {
  recommendations: DiscoveryRecommendation[];
  personalized: boolean;
};

export type DiscoveryFeedbackEligibility = {
  eligible: boolean;
  reasonCode: string;
  reason: string;
  alreadySubmitted: boolean;
};

export type DiscoveryFeedbackSummary = {
  eventId: string;
  ratingAverage: number;
  ratingCount: number;
  tagFrequency: Array<{
    tag: string;
    count: number;
  }>;
};

export type DiscoveryFeedbackEntry = {
  id: string;
  userId: string;
  userName: string;
  userImageUrl: string | null;
  rating: number;
  reviewText: string | null;
  createdAt: string;
};

export type DiscoveryEventFeedbackState = {
  feedbackSummary: DiscoveryFeedbackSummary;
  feedbackEligibility: DiscoveryFeedbackEligibility;
  entries: DiscoveryFeedbackEntry[];
  entryPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  viewerFeedback: DiscoveryFeedbackEntry | null;
};

export type EventReputationSnapshot = {
  eventId: string;
  eventReputationScore: number;
  organizerReputationScore: number;
  ratingAverage: number;
  ratingCount: number;
  attendanceRate: number;
};

export type DiscoverableEventDetail = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  galleryImages: string[];
  venueMode: VenueMode;
  venueName: string | null;
  venueAddress: string | null;
  virtualMeetingUrl: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  visibility: "PUBLIC" | "UNLISTED";
  organizer: {
    id: string;
    name: string;
    region: string;
  };
  sessions: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    room: string | null;
  }>;
  ticketClasses: Array<{
    id: string;
    name: string;
    type: "FREE" | "PAID" | "VIP";
    price: number;
    currency: string;
    salesStartAt: string;
    salesEndAt: string;
    capacity: number;
  }>;
  availability: DiscoveryAvailabilitySnapshot;
  feedbackSummary: DiscoveryFeedbackSummary;
  feedbackEligibility: DiscoveryFeedbackEligibility;
  feedbackEntries: DiscoveryFeedbackEntry[];
  feedbackEntryPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  viewerFeedback: DiscoveryFeedbackEntry | null;
  reputation: EventReputationSnapshot;
};
