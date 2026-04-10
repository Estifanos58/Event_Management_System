import { TicketStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type {
  SeedEventProfile,
  SeedOrderProfile,
  SeedReservationItemProfile,
  SeedReservationProfile,
  SeedTicketProfile,
} from "./types";

type TicketSeedResult = {
  profiles: SeedTicketProfile[];
  tickets: Prisma.TicketCreateManyInput[];
};

export function buildTickets(input: {
  orders: SeedOrderProfile[];
  reservations: SeedReservationProfile[];
  reservationItems: SeedReservationItemProfile[];
  events: SeedEventProfile[];
  attendeeIds: string[];
  refundedOrderIds: Set<string>;
}): TicketSeedResult {
  const profiles: SeedTicketProfile[] = [];
  const tickets: Prisma.TicketCreateManyInput[] = [];

  const reservationById = new Map(input.reservations.map((reservation) => [reservation.id, reservation]));
  const eventById = new Map(input.events.map((event) => [event.id, event]));

  let ticketIndex = 1;

  for (const order of input.orders) {
    if (order.status !== "COMPLETED") {
      continue;
    }

    const reservation = reservationById.get(order.reservationId);

    if (!reservation) {
      continue;
    }

    const event = eventById.get(order.eventId);

    if (!event) {
      continue;
    }

    const items = input.reservationItems.filter((item) => item.reservationId === reservation.id);

    for (const item of items) {
      for (let unit = 0; unit < item.quantity; unit += 1) {
        const isRefunded = input.refundedOrderIds.has(order.id);

        let status: TicketStatus;

        if (isRefunded) {
          status = TicketStatus.REFUNDED;
        } else if (event.status === "COMPLETED") {
          status = TicketStatus.USED;
        } else if (ticketIndex % 29 === 0) {
          status = TicketStatus.CANCELLED;
        } else {
          status = TicketStatus.VALID;
        }

        const attendeeId =
          unit === 0
            ? order.buyerUserId
            : pickCyclic(input.attendeeIds, ticketIndex + unit);

        const issuedAt = addHours(order.completedAt ?? order.createdAt, unit + 1);
        const ticketId = ids.ticket(ticketIndex);

        profiles.push({
          id: ticketId,
          eventId: order.eventId,
          ticketClassId: item.ticketClassId,
          orderId: order.id,
          ownerId: order.buyerUserId,
          attendeeId,
          status,
          issuedAt,
        });

        tickets.push({
          id: ticketId,
          eventId: order.eventId,
          ticketClassId: item.ticketClassId,
          orderId: order.id,
          ownerId: order.buyerUserId,
          attendeeId,
          qrToken: ids.qrToken(ticketIndex),
          deliveryChannels: ["EMAIL", "IN_APP"],
          status,
          cancelledAt:
            status === TicketStatus.CANCELLED || status === TicketStatus.REFUNDED
              ? addHours(issuedAt, 24)
              : null,
          cancellationReason:
            status === TicketStatus.REFUNDED
              ? "Refund processed"
              : status === TicketStatus.CANCELLED
                ? "Cancelled by attendee"
                : null,
          issuedAt,
          updatedAt: addHours(issuedAt, 2),
        });

        ticketIndex += 1;
      }
    }
  }

  return {
    profiles,
    tickets,
  };
}
