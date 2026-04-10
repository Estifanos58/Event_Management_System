import { Role, ScopeType } from "@prisma/client";

export const PERMISSIONS = [
  "platform.admin",
  "org.read",
  "org.manage",
  "org.verified.action",
  "event.read",
  "event.manage",
  "ticket.manage",
  "checkin.scan",
  "checkin.manual",
  "checkin.metrics",
  "checkin.incident",
  "finance.manage",
  "profile.manage",
  "high_risk.approve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type AccessContext = {
  type: ScopeType;
  id: string;
};

export type PermissionResolution = {
  userId: string;
  context: AccessContext;
  roles: Role[];
  permissions: Set<Permission>;
  roleBindingIds: string[];
};

export type UserContextOption = {
  type: ScopeType;
  id: string;
  label: string;
  role: Role;
};

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    "platform.admin",
    "org.read",
    "org.manage",
    "org.verified.action",
    "event.read",
    "event.manage",
    "ticket.manage",
    "checkin.scan",
    "checkin.manual",
    "checkin.metrics",
    "checkin.incident",
    "finance.manage",
    "profile.manage",
    "high_risk.approve",
  ],
  [Role.ORGANIZER]: [
    "org.read",
    "org.manage",
    "org.verified.action",
    "event.read",
    "event.manage",
    "ticket.manage",
    "checkin.scan",
    "checkin.manual",
    "checkin.metrics",
    "checkin.incident",
    "finance.manage",
    "profile.manage",
  ],
  [Role.STAFF]: [
    "org.read",
    "event.read",
    "checkin.scan",
    "checkin.metrics",
    "checkin.incident",
    "ticket.manage",
  ],
  [Role.ATTENDEE]: ["event.read", "profile.manage"],
};
