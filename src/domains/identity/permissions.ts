import { Prisma, Role, ScopeType } from "@prisma/client";
import { prisma } from "@/core/db/prisma";
import {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type AccessContext,
  type Permission,
  type PermissionResolution,
  type UserContextOption,
} from "@/domains/identity/types";

const permissionSet = new Set<string>(PERMISSIONS);

function normalizePermission(value: unknown): Permission | null {
  if (typeof value !== "string") {
    return null;
  }

  if (!permissionSet.has(value)) {
    return null;
  }

  return value as Permission;
}

function extractCustomPermissions(value: Prisma.JsonValue): Permission[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePermission(entry))
      .filter((entry): entry is Permission => Boolean(entry));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fromFlags = Object.entries(record)
      .filter(([, enabled]) => enabled === true)
      .map(([permission]) => normalizePermission(permission))
      .filter((entry): entry is Permission => Boolean(entry));

    if (fromFlags.length > 0) {
      return fromFlags;
    }

    if (Array.isArray(record.allow)) {
      return record.allow
        .map((entry) => normalizePermission(entry))
        .filter((entry): entry is Permission => Boolean(entry));
    }
  }

  return [];
}

export async function resolveOrganizationIdFromContext(
  context: AccessContext,
): Promise<string | null> {
  if (context.type === ScopeType.ORGANIZATION) {
    return context.id;
  }

  if (context.type !== ScopeType.EVENT) {
    return null;
  }

  const event = await prisma.event.findUnique({
    where: { id: context.id },
    select: { orgId: true },
  });

  return event?.orgId ?? null;
}

async function loadRoleBindings(userId: string, context: AccessContext) {
  const candidates: Prisma.RoleBindingWhereInput[] = [
    {
      scopeType: ScopeType.PLATFORM,
    },
    {
      scopeType: context.type,
      scopeId: context.id,
    },
  ];

  if (context.type === ScopeType.PERSONAL) {
    candidates.push({
      scopeType: ScopeType.PERSONAL,
      scopeId: userId,
    });
  }

  const orgId = await resolveOrganizationIdFromContext(context);
  if (orgId && context.type === ScopeType.EVENT) {
    candidates.push({
      scopeType: ScopeType.ORGANIZATION,
      scopeId: orgId,
    });
  }

  return prisma.roleBinding.findMany({
    where: {
      userId,
      OR: candidates,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getPermissions(
  userId: string,
  context: AccessContext,
): Promise<PermissionResolution> {
  const roleBindings = await loadRoleBindings(userId, context);

  const roleSet = new Set<Role>();
  const permissions = new Set<Permission>();

  for (const roleBinding of roleBindings) {
    roleSet.add(roleBinding.role);

    for (const permission of ROLE_DEFAULT_PERMISSIONS[roleBinding.role]) {
      permissions.add(permission);
    }

    for (const permission of extractCustomPermissions(roleBinding.permissions)) {
      permissions.add(permission);
    }
  }

  return {
    userId,
    context,
    roles: Array.from(roleSet),
    permissions,
    roleBindingIds: roleBindings.map((roleBinding) => roleBinding.id),
  };
}

export function canAccess(
  resolution: PermissionResolution,
  permission: Permission,
): boolean {
  return resolution.permissions.has(permission);
}

export async function canUserAccess(
  userId: string,
  context: AccessContext,
  permission: Permission,
): Promise<boolean> {
  const resolution = await getPermissions(userId, context);
  return canAccess(resolution, permission);
}

export async function listUserContexts(
  userId: string,
): Promise<UserContextOption[]> {
  const roleBindings = await prisma.roleBinding.findMany({
    where: {
      userId,
    },
    include: {
      organization: {
        select: {
          displayName: true,
        },
      },
      event: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const contextMap = new Map<string, UserContextOption>();

  for (const roleBinding of roleBindings) {
    const key = `${roleBinding.scopeType}:${roleBinding.scopeId}`;
    if (contextMap.has(key)) {
      continue;
    }

    let label = roleBinding.scopeId;
    if (roleBinding.scopeType === ScopeType.PLATFORM) {
      label = "Platform";
    } else if (roleBinding.scopeType === ScopeType.PERSONAL) {
      label = "Personal Workspace";
    } else if (roleBinding.scopeType === ScopeType.ORGANIZATION) {
      label = roleBinding.organization?.displayName ?? `Organization ${roleBinding.scopeId}`;
    } else if (roleBinding.scopeType === ScopeType.EVENT) {
      label = roleBinding.event?.title ?? `Event ${roleBinding.scopeId}`;
    }

    contextMap.set(key, {
      type: roleBinding.scopeType,
      id: roleBinding.scopeId,
      label,
      role: roleBinding.role,
    });
  }

  return Array.from(contextMap.values());
}
