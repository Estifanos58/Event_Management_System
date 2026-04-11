import { Role, ScopeType, type Prisma } from "@prisma/client";
import { subDays } from "../utils/dates";
import { ids } from "../utils/ids";
import type { SeedEventProfile, SeedOrganizationProfile, SeedUserProfile } from "./types";

export function buildRoleBindings(input: {
  now: Date;
  users: SeedUserProfile[];
  organizations: SeedOrganizationProfile[];
  events: SeedEventProfile[];
  gateStaffAssignments: Prisma.GateStaffAssignmentCreateManyInput[];
}): Prisma.RoleBindingCreateManyInput[] {
  const bindings: Prisma.RoleBindingCreateManyInput[] = [];
  let index = 1;

  const superAdmins = input.users.filter((user) => user.group === "SUPER_ADMIN");

  if (superAdmins.length === 0) {
    throw new Error("Missing SUPER_ADMIN seed user.");
  }

  superAdmins.forEach((superAdmin, adminOffset) => {
    bindings.push({
      id: ids.roleBinding(index),
      userId: superAdmin.id,
      role: Role.SUPER_ADMIN,
      scopeType: ScopeType.PLATFORM,
      scopeId: "platform_main",
      permissions: {
        allowed: ["*"],
      },
      createdAt: subDays(input.now, 180 - adminOffset),
    });

    index += 1;
  });

  const organizers = input.users.filter((user) => user.group === "ORGANIZER");

  organizers.forEach((organizer, organizerIndex) => {
    const organization = input.organizations[organizerIndex % input.organizations.length];

    bindings.push({
      id: ids.roleBinding(index),
      userId: organizer.id,
      role: Role.ORGANIZER,
      scopeType: ScopeType.ORGANIZATION,
      scopeId: organization.id,
      organizationId: organization.id,
      permissions: {
        allowed: [
          "event.read",
          "event.manage",
          "ticketing.manage",
          "analytics.read",
          "notification.manage",
        ],
      },
      createdAt: subDays(input.now, 140 - organizerIndex),
    });

    index += 1;
  });

  for (const event of input.events) {
    bindings.push({
      id: ids.roleBinding(index),
      userId: event.createdBy,
      role: Role.ORGANIZER,
      scopeType: ScopeType.EVENT,
      scopeId: event.id,
      organizationId: event.orgId,
      eventId: event.id,
      permissions: {
        allowed: [
          "event.read",
          "event.manage",
          "ticketing.manage",
          "checkin.manage",
          "notification.manage",
        ],
      },
      createdAt: subDays(input.now, 110 - event.sequence),
    });

    index += 1;
  }

  const addedStaffKeys = new Set<string>();

  for (const assignment of input.gateStaffAssignments) {
    const key = `${assignment.userId}:${assignment.eventId}`;

    if (addedStaffKeys.has(key)) {
      continue;
    }

    addedStaffKeys.add(key);

    const event = input.events.find((item) => item.id === assignment.eventId);

    if (!event) {
      continue;
    }

    bindings.push({
      id: ids.roleBinding(index),
      userId: assignment.userId,
      role: Role.STAFF,
      scopeType: ScopeType.EVENT,
      scopeId: assignment.eventId,
      organizationId: event.orgId,
      eventId: assignment.eventId,
      permissions: {
        allowed: ["event.read", "checkin.scan", "checkin.incident.manage"],
      },
      createdAt: subDays(input.now, 30 - (index % 10)),
    });

    index += 1;
  }

  const attendees = input.users.filter((user) => user.group === "ATTENDEE").slice(0, 20);

  for (const attendee of attendees) {
    bindings.push({
      id: ids.roleBinding(index),
      userId: attendee.id,
      role: Role.ATTENDEE,
      scopeType: ScopeType.PERSONAL,
      scopeId: attendee.id,
      permissions: {
        allowed: ["event.read", "ticket.read", "feedback.submit"],
      },
      createdAt: subDays(input.now, 25 - (index % 7)),
    });

    index += 1;
  }

  return bindings;
}
