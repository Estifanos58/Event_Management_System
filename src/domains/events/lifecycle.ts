import { EventStatus } from "@prisma/client";
import { EventDomainError } from "@/domains/events/errors";
import { EVENT_TRANSITION_MAP } from "@/domains/events/types";

const REASON_REQUIRED_STATUSES = new Set<EventStatus>([
  EventStatus.CANCELLED,
  EventStatus.POSTPONED,
]);

const VERIFIED_ORG_REQUIRED_STATUSES = new Set<EventStatus>([
  EventStatus.PUBLISHED,
  EventStatus.LIVE,
]);

export function listAllowedTransitions(status: EventStatus): EventStatus[] {
  return EVENT_TRANSITION_MAP[status] ?? [];
}

export function isTransitionAllowed(
  currentStatus: EventStatus,
  nextStatus: EventStatus,
): boolean {
  const allowed = listAllowedTransitions(currentStatus);
  return allowed.includes(nextStatus);
}

export function assertTransitionAllowed(
  currentStatus: EventStatus,
  nextStatus: EventStatus,
) {
  if (currentStatus === nextStatus) {
    throw new EventDomainError(
      400,
      "INVALID_TRANSITION",
      `Event is already in ${nextStatus}.`,
    );
  }

  if (!isTransitionAllowed(currentStatus, nextStatus)) {
    throw new EventDomainError(
      409,
      "INVALID_TRANSITION",
      `Transition ${currentStatus} -> ${nextStatus} is not allowed.`,
    );
  }
}

export function requiresReasonForTransition(nextStatus: EventStatus): boolean {
  return REASON_REQUIRED_STATUSES.has(nextStatus);
}

export function requiresVerifiedOrganization(nextStatus: EventStatus): boolean {
  return VERIFIED_ORG_REQUIRED_STATUSES.has(nextStatus);
}
