import { EventStatus, type Prisma } from "@prisma/client";
import { addDays } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedEventProfile, SeedTicketProfile } from "./types";

const FEEDBACK_TAGS = [
  ["insightful", "well-organized"],
  ["great-speakers", "networking"],
  ["hands-on", "practical"],
  ["needs-audio-improvement"],
  ["excellent-checkin", "friendly-staff"],
];

export function buildFeedback(input: {
  tickets: SeedTicketProfile[];
  events: SeedEventProfile[];
}): Prisma.FeedbackCreateManyInput[] {
  const feedback: Prisma.FeedbackCreateManyInput[] = [];
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const usedTickets = input.tickets.filter((ticket) => ticket.status === "USED");
  const seenKey = new Set<string>();

  let index = 1;

  for (const ticket of usedTickets) {
    const event = eventById.get(ticket.eventId);

    if (!event || event.status !== EventStatus.COMPLETED) {
      continue;
    }

    const key = `${ticket.eventId}:${ticket.attendeeId}`;

    if (seenKey.has(key)) {
      continue;
    }

    seenKey.add(key);

    const rating = ((index + 2) % 5) + 1;

    feedback.push({
      id: ids.feedback(index),
      eventId: ticket.eventId,
      userId: ticket.attendeeId,
      rating,
      reviewText:
        rating >= 4
          ? "Great event quality, smooth operations, and valuable content throughout the day."
          : "Useful event overall, with a few areas to improve in pacing and venue logistics.",
      tags: FEEDBACK_TAGS[(index - 1) % FEEDBACK_TAGS.length],
      createdAt: addDays(event.endAt, Math.max(1, (index % 5) + 1)),
    });

    index += 1;

    if (index > 24) {
      break;
    }
  }

  return feedback;
}
