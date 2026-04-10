import { CheckInMode, CheckInStatus, EventStatus, type Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedTicketProfile } from "./types";

export function buildCheckIns(input: {
  tickets: SeedTicketProfile[];
  events: SeedEventProfile[];
  gates: Prisma.GateCreateManyInput[];
  gateStaffAssignments: Prisma.GateStaffAssignmentCreateManyInput[];
}): Prisma.CheckInEventCreateManyInput[] {
  const checkIns: Prisma.CheckInEventCreateManyInput[] = [];

  const eventById = new Map(input.events.map((event) => [event.id, event]));

  const liveOrCompletedTickets = input.tickets.filter((ticket) => {
    const event = eventById.get(ticket.eventId);

    if (!event) {
      return false;
    }

    return event.status === EventStatus.LIVE || event.status === EventStatus.COMPLETED;
  });

  const gatesByEvent = new Map<string, Prisma.GateCreateManyInput[]>();

  for (const gate of input.gates) {
    const existing = gatesByEvent.get(gate.eventId) ?? [];
    existing.push(gate);
    gatesByEvent.set(gate.eventId, existing);
  }

  const scannerByEvent = new Map<string, string>();

  for (const assignment of input.gateStaffAssignments) {
    if (!scannerByEvent.has(assignment.eventId)) {
      scannerByEvent.set(assignment.eventId, assignment.userId);
    }
  }

  const checkInCount = Math.min(48, liveOrCompletedTickets.length);

  for (let index = 1; index <= checkInCount; index += 1) {
    const ticket = liveOrCompletedTickets[index - 1];
    const event = eventById.get(ticket.eventId);

    if (!event) {
      continue;
    }

    const eventGates = gatesByEvent.get(ticket.eventId) ?? [];

    if (eventGates.length === 0) {
      continue;
    }

    const gate = pickCyclic(eventGates, index - 1);
    const scanner = scannerByEvent.get(ticket.eventId);

    if (!scanner || !gate.id) {
      continue;
    }

    const status: CheckInStatus =
      index % 10 === 0
        ? CheckInStatus.DUPLICATE
        : index % 13 === 0
          ? CheckInStatus.REJECTED
          : CheckInStatus.ACCEPTED;

    const windowDurationHours = Math.max(
      1,
      Math.floor((event.endAt.getTime() - event.startAt.getTime()) / (60 * 60 * 1000)),
    );
    const offsetHours = Math.max(0, Math.min(windowDurationHours - 1, index % windowDurationHours));

    const scannedAt = addHours(event.startAt, offsetHours);

    checkIns.push({
      id: ids.checkIn(index),
      ticketId: ticket.id,
      eventId: ticket.eventId,
      gateId: gate.id,
      scannedBy: scanner,
      mode: index % 4 === 0 ? CheckInMode.OFFLINE : CheckInMode.ONLINE,
      status,
      reason:
        status === CheckInStatus.DUPLICATE
          ? "Ticket already checked in"
          : status === CheckInStatus.REJECTED
            ? "Ticket not valid for selected gate"
            : null,
      deviceId: `scanner_device_${(index % 6) + 1}`,
      clientScanId: ids.idempotency("scan", index),
      scannedAt,
      syncedAt: addHours(scannedAt, 1),
    });
  }

  return checkIns;
}
