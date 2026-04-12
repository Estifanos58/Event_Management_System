export const discoveryDomain = {
  name: "discovery",
  description:
    "Owns public discovery listing, search/suggestions, recommendation baseline, and feedback engagement.",
};

export {
  listDiscoverableEvents,
  getEventAvailabilitySnapshot,
  getDiscoverableEventDetail,
  getDiscoverySuggestions,
  getDiscoveryRecommendations,
  getEventFeedbackStatus,
  submitEventFeedback,
  deleteMyEventFeedback,
} from "@/domains/discovery/service";

export {
  DiscoveryDomainError,
  toDiscoveryErrorResponse,
  type DiscoveryDomainErrorCode,
} from "@/domains/discovery/errors";

export type {
  DiscoverySort,
  DiscoveryAvailabilityFilter,
  DiscoveryQueryInput,
  DiscoverySuggestionInput,
  DiscoveryRecommendationInput,
  DiscoveryFeedbackInput,
  DiscoveryEventCard,
  DiscoveryListResult,
  DiscoveryAvailabilitySnapshot,
  DiscoveryRecommendation,
  DiscoveryRecommendationResult,
  DiscoveryFeedbackEligibility,
  DiscoveryFeedbackEntry,
  DiscoveryEventFeedbackState,
  DiscoveryFeedbackSummary,
  EventReputationSnapshot,
  DiscoverableEventDetail,
} from "@/domains/discovery/types";
