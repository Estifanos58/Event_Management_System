import { TicketTransferStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedTicketProfile } from "./types";

export function buildTicketTransfers(input: {
  tickets: SeedTicketProfile[];
  attendeeIds: string[];
}): Prisma.TicketTransferCreateManyInput[] {
  const transfers: Prisma.TicketTransferCreateManyInput[] = [];

  const candidateTickets = input.tickets.filter((ticket) => ticket.status === "VALID").slice(0, 15);

  for (let index = 1; index <= candidateTickets.length; index += 1) {
    const ticket = candidateTickets[index - 1];

    let status: TicketTransferStatus;

    if (index <= 5) {
      status = TicketTransferStatus.PENDING;
    } else if (index <= 9) {
      status = TicketTransferStatus.ACCEPTED;
    } else if (index <= 12) {
      status = TicketTransferStatus.EXPIRED;
    } else if (index <= 14) {
      status = TicketTransferStatus.REJECTED;
    } else {
      status = TicketTransferStatus.CANCELLED;
    }

    const candidateRecipient = pickCyclic(input.attendeeIds, index + 3);
    const toUserId = candidateRecipient === ticket.ownerId ? pickCyclic(input.attendeeIds, index + 13) : candidateRecipient;
    const expiresAt = addHours(ticket.issuedAt, 72 + index);

    transfers.push({
      id: ids.transfer(index),
      ticketId: ticket.id,
      fromUserId: ticket.ownerId,
      toUserId,
      status,
      respondedAt:
        status === TicketTransferStatus.PENDING || status === TicketTransferStatus.EXPIRED
          ? null
          : addHours(ticket.issuedAt, 36 + index),
      responseReason:
        status === TicketTransferStatus.REJECTED
          ? "Recipient declined transfer"
          : status === TicketTransferStatus.CANCELLED
            ? "Sender cancelled transfer request"
            : null,
      expiresAt,
      createdAt: addHours(ticket.issuedAt, 24),
    });
  }

  return transfers;
}
