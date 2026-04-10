import { EventSessionStatus, EventStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedEventProfile } from "./types";

export function buildEventSessions(events: SeedEventProfile[]): Prisma.EventSessionCreateManyInput[] {
  const sessions: Prisma.EventSessionCreateManyInput[] = [];

  for (const event of events) {
    const totalHours = Math.max(2, Math.floor((event.endAt.getTime() - event.startAt.getTime()) / (60 * 60 * 1000)));
    const midPointHours = Math.max(1, Math.floor(totalHours / 2));

    const statusForEvent =
      event.status === EventStatus.CANCELLED
        ? EventSessionStatus.CANCELLED
        : event.status === EventStatus.COMPLETED
          ? EventSessionStatus.COMPLETED
          : EventSessionStatus.SCHEDULED;

    sessions.push({
      id: ids.eventSession(event.sequence, 1),
      eventId: event.id,
      title: `${event.title} - Opening Session`,
      startAt: event.startAt,
      endAt: addHours(event.startAt, Math.max(1, midPointHours - 1)),
      room: event.venueMode === "VIRTUAL" ? "Main Stream" : "Hall A",
      capacity: Math.max(40, Math.floor(event.totalCapacity * 0.65)),
      waitlistEnabled: event.waitlistEnabled,
      status: statusForEvent,
      createdAt: addHours(event.startAt, -72),
      updatedAt: addHours(event.startAt, -36),
    });

    sessions.push({
      id: ids.eventSession(event.sequence, 2),
      eventId: event.id,
      title: `${event.title} - Breakout Session`,
      startAt: addHours(event.startAt, midPointHours),
      endAt: event.endAt,
      room: event.venueMode === "VIRTUAL" ? "Workshop Room" : "Hall B",
      capacity: Math.max(30, Math.floor(event.totalCapacity * 0.45)),
      waitlistEnabled: event.waitlistEnabled,
      status: statusForEvent,
      createdAt: addHours(event.startAt, -70),
      updatedAt: addHours(event.startAt, -30),
    });
  }

  return sessions;
}
