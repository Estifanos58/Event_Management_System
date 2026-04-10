import { ScopeType, type Prisma } from "@prisma/client";
import { addHours, subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import { pickCyclic } from "../utils/helpers";
import type { SeedEventProfile, SeedOrderProfile, SeedUserProfile } from "./types";

export function buildAuditEvents(input: {
  now: Date;
  users: SeedUserProfile[];
  events: SeedEventProfile[];
  orders: SeedOrderProfile[];
  checkIns: Prisma.CheckInEventCreateManyInput[];
}): Prisma.AuditEventCreateManyInput[] {
  const auditEvents: Prisma.AuditEventCreateManyInput[] = [];

  let index = 1;

  for (const event of input.events) {
    const actor = pickCyclic(input.users, index);

    auditEvents.push({
      id: ids.audit(index),
      actorId: actor.id,
      actorType: actor.group,
      action: "event.lifecycle.seeded",
      scopeType: ScopeType.EVENT,
      scopeId: event.id,
      targetType: "Event",
      targetId: event.id,
      newValue: {
        status: event.status,
        visibility: event.visibility,
      },
      reason: "Initial seed lifecycle state",
      createdAt: subDays(input.now, 12 - (index % 5)),
    });

    index += 1;
  }

  for (const order of input.orders.slice(0, 40)) {
    const actor = pickCyclic(input.users, index + 2);

    auditEvents.push({
      id: ids.audit(index),
      actorId: actor.id,
      actorType: actor.group,
      action: "order.workflow.seeded",
      scopeType: ScopeType.EVENT,
      scopeId: order.eventId,
      targetType: "Order",
      targetId: order.id,
      newValue: {
        status: order.status,
        totalAmount: order.totalAmount,
      },
      reason: "Seeded checkout workflow event",
      createdAt: addHours(order.createdAt, 2),
    });

    index += 1;
  }

  for (const checkIn of input.checkIns.slice(0, 20)) {
    if (!checkIn.id || !checkIn.scannedAt) {
      continue;
    }

    const scannedAt =
      checkIn.scannedAt instanceof Date
        ? checkIn.scannedAt
        : new Date(checkIn.scannedAt);
    const actor = pickCyclic(input.users, index + 1);

    auditEvents.push({
      id: ids.audit(index),
      actorId: actor.id,
      actorType: actor.group,
      action: "checkin.scan.seeded",
      scopeType: ScopeType.EVENT,
      scopeId: checkIn.eventId,
      targetType: "CheckInEvent",
      targetId: checkIn.id,
      newValue: {
        status: checkIn.status,
        mode: checkIn.mode,
      },
      reason: "Seeded gate operation telemetry",
      createdAt: addHours(scannedAt, 1),
    });

    index += 1;
  }

  return auditEvents;
}
