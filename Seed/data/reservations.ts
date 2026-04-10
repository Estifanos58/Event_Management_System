import { ReservationStatus, type Prisma } from "@prisma/client";
import { addHours, subDays, subHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type {
  SeedEventProfile,
  SeedReservationItemProfile,
  SeedReservationProfile,
  SeedTicketClassProfile,
} from "./types";

type ReservationSeedResult = {
  reservationProfiles: SeedReservationProfile[];
  reservationItemProfiles: SeedReservationItemProfile[];
  reservations: Prisma.ReservationCreateManyInput[];
  reservationItems: Prisma.ReservationItemCreateManyInput[];
};

function statusForReservation(index: number): ReservationStatus {
  if (index <= 80) {
    return ReservationStatus.CONFIRMED;
  }

  if (index <= 95) {
    return ReservationStatus.PENDING;
  }

  if (index <= 103) {
    return ReservationStatus.EXPIRED;
  }

  return ReservationStatus.CANCELLED;
}

export function buildReservations(input: {
  now: Date;
  events: SeedEventProfile[];
  attendeeIds: string[];
  ticketClasses: SeedTicketClassProfile[];
}): ReservationSeedResult {
  const reservations: Prisma.ReservationCreateManyInput[] = [];
  const reservationItems: Prisma.ReservationItemCreateManyInput[] = [];
  const reservationProfiles: SeedReservationProfile[] = [];
  const reservationItemProfiles: SeedReservationItemProfile[] = [];

  const orderFlowEvents = input.events.filter((event) =>
    ["SOLD_OUT", "LIVE", "COMPLETED", "PRIVATE", "VIRTUAL", "STANDARD"].includes(event.scenario),
  );
  const holdFlowEvents = input.events;

  let reservationItemIndex = 1;

  for (let reservationIndex = 1; reservationIndex <= 110; reservationIndex += 1) {
    const status = statusForReservation(reservationIndex);
    const event =
      reservationIndex <= 80
        ? pickCyclic(orderFlowEvents, reservationIndex - 1)
        : pickCyclic(holdFlowEvents, reservationIndex - 1);
    const userId = pickCyclic(input.attendeeIds, reservationIndex - 1);
    const createdAt = addHours(subDays(input.now, 28), reservationIndex * 3);

    const expiresAt =
      status === ReservationStatus.EXPIRED
        ? subHours(input.now, (reservationIndex % 4) + 2)
        : status === ReservationStatus.PENDING
          ? addHours(input.now, (reservationIndex % 6) + 2)
          : addHours(createdAt, 24 + (reservationIndex % 10));

    const reservationId = ids.reservation(reservationIndex);

    reservationProfiles.push({
      id: reservationId,
      eventId: event.id,
      orgId: event.orgId,
      userId,
      status,
      createdAt,
      expiresAt,
    });

    reservations.push({
      id: reservationId,
      eventId: event.id,
      userId,
      status,
      expiresAt,
      source: reservationIndex % 2 === 0 ? "WEB" : "MOBILE",
      idempotencyKey: ids.idempotency("reservation", reservationIndex),
      createdAt,
      updatedAt: addHours(createdAt, 1),
    });

    const candidateTicketClasses = input.ticketClasses.filter((ticketClass) => ticketClass.eventId === event.id);
    const primaryTier = reservationIndex % 7 === 0 ? "VIP" : reservationIndex % 2 === 0 ? "PAID" : "FREE";
    const primaryTicketClass =
      candidateTicketClasses.find((ticketClass) => ticketClass.tier === primaryTier) ??
      candidateTicketClasses[0];

    if (!primaryTicketClass) {
      continue;
    }

    const primaryQuantity = reservationIndex <= 80 ? (reservationIndex % 3) + 1 : 1;

    const primaryItemId = ids.reservationItem(reservationIndex, 1);

    reservationItemProfiles.push({
      id: primaryItemId,
      reservationId,
      ticketClassId: primaryTicketClass.id,
      quantity: primaryQuantity,
    });

    reservationItems.push({
      id: primaryItemId,
      reservationId,
      ticketClassId: primaryTicketClass.id,
      quantity: primaryQuantity,
    });

    reservationItemIndex += 1;

    if (reservationIndex % 4 === 0 && candidateTicketClasses.length > 1) {
      const secondaryTicketClass =
        candidateTicketClasses.find((ticketClass) => ticketClass.tier === "PAID") ??
        candidateTicketClasses[1];

      const secondaryItemId = ids.reservationItem(reservationIndex, 2);

      reservationItemProfiles.push({
        id: secondaryItemId,
        reservationId,
        ticketClassId: secondaryTicketClass.id,
        quantity: 1,
      });

      reservationItems.push({
        id: secondaryItemId,
        reservationId,
        ticketClassId: secondaryTicketClass.id,
        quantity: 1,
      });

      reservationItemIndex += 1;
    }
  }

  void reservationItemIndex;

  return {
    reservationProfiles,
    reservationItemProfiles,
    reservations,
    reservationItems,
  };
}
