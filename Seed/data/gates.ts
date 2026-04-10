import type { Prisma } from "@prisma/client";
import { addHours } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedTicketClassProfile } from "./types";

type GateSeedResult = {
  gates: Prisma.GateCreateManyInput[];
  gateStaffAssignments: Prisma.GateStaffAssignmentCreateManyInput[];
  gateTicketClassAccesses: Prisma.GateTicketClassAccessCreateManyInput[];
};

export function buildGates(input: {
  events: SeedEventProfile[];
  ticketClasses: SeedTicketClassProfile[];
  staffIds: string[];
}): GateSeedResult {
  const gates: Prisma.GateCreateManyInput[] = [];
  const gateStaffAssignments: Prisma.GateStaffAssignmentCreateManyInput[] = [];
  const gateTicketClassAccesses: Prisma.GateTicketClassAccessCreateManyInput[] = [];

  let assignmentIndex = 1;
  let accessIndex = 1;

  for (const event of input.events) {
    const gateCount = event.venueMode === "VIRTUAL" ? 1 : 2;

    for (let gateNumber = 1; gateNumber <= gateCount; gateNumber += 1) {
      const gateId = ids.gate(event.sequence, gateNumber);

      gates.push({
        id: gateId,
        eventId: event.id,
        name: gateNumber === 1 ? "Main Gate" : "Fast Track Gate",
        code: `G-${event.sequence}-${gateNumber}`,
        createdAt: addHours(event.startAt, -48 + gateNumber),
        updatedAt: addHours(event.startAt, -24 + gateNumber),
      });

      const assignedStaff = pickCyclic(input.staffIds, assignmentIndex - 1);

      gateStaffAssignments.push({
        id: ids.gateStaffAssignment(assignmentIndex),
        gateId,
        eventId: event.id,
        userId: assignedStaff,
        assignmentRole: gateNumber === 1 ? "Lead Scanner" : "Queue Manager",
        createdAt: addHours(event.startAt, -12 + gateNumber),
      });

      assignmentIndex += 1;

      const eventTicketClasses = input.ticketClasses.filter((ticketClass) => ticketClass.eventId === event.id);

      for (const ticketClass of eventTicketClasses) {
        gateTicketClassAccesses.push({
          id: ids.gateTicketClassAccess(accessIndex),
          eventId: event.id,
          gateId,
          ticketClassId: ticketClass.id,
          createdAt: addHours(event.startAt, -10 + gateNumber),
        });

        accessIndex += 1;
      }
    }
  }

  return {
    gates,
    gateStaffAssignments,
    gateTicketClassAccesses,
  };
}
