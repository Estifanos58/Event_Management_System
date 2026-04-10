import { WaitlistStatus, type Prisma } from "@prisma/client";
import { addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedTicketClassProfile } from "./types";

export function buildWaitlist(input: {
  now: Date;
  soldOutEventId: string;
  attendeeIds: string[];
  ticketClasses: SeedTicketClassProfile[];
}): Prisma.WaitlistEntryCreateManyInput[] {
  const waitlist: Prisma.WaitlistEntryCreateManyInput[] = [];

  const soldOutTicketClass =
    input.ticketClasses.find(
      (ticketClass) => ticketClass.eventId === input.soldOutEventId && ticketClass.tier === "PAID",
    ) ?? input.ticketClasses.find((ticketClass) => ticketClass.eventId === input.soldOutEventId);

  if (!soldOutTicketClass) {
    return waitlist;
  }

  for (let index = 1; index <= 20; index += 1) {
    const status: WaitlistStatus =
      index <= 10
        ? WaitlistStatus.WAITING
        : index <= 14
          ? WaitlistStatus.NOTIFIED
          : index <= 17
            ? WaitlistStatus.CLAIMED
            : index === 18
              ? WaitlistStatus.EXPIRED
              : WaitlistStatus.REMOVED;

    const createdAt = subDays(input.now, 4 - Math.floor(index / 5));

    waitlist.push({
      id: ids.waitlist(index),
      eventId: input.soldOutEventId,
      ticketClassId: soldOutTicketClass.id,
      userId: pickCyclic(input.attendeeIds, index + 7),
      priority: index,
      status,
      notifiedAt:
        status === WaitlistStatus.NOTIFIED || status === WaitlistStatus.CLAIMED
          ? addHours(createdAt, 6)
          : null,
      claimExpiresAt:
        status === WaitlistStatus.NOTIFIED || status === WaitlistStatus.EXPIRED
          ? addHours(createdAt, 30)
          : null,
      createdAt,
    });
  }

  return waitlist;
}
