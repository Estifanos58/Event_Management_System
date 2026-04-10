import { ScopeType } from "@prisma/client";
import { recordAuthorizationDecision } from "@/core/audit/audit";
import { getServerSessionOrNull } from "@/core/auth/session";
import { prisma } from "@/core/db/prisma";
import {
  canAccess,
  getPermissions,
  resolveOrganizationIdFromContext,
} from "@/domains/identity/permissions";
import type { AccessContext, Permission } from "@/domains/identity/types";

export class AuthorizationError extends Error {
  status: number;
  code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.code = status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
  }
}

type PermissionCheckInput = {
  context: AccessContext;
  permission: Permission;
  action: string;
  targetType: string;
  targetId: string;
  highRisk?: boolean;
};

export function createAccessContext(type: ScopeType, id: string): AccessContext {
  return {
    type,
    id,
  };
}

export async function requirePermission(input: PermissionCheckInput) {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new AuthorizationError(401, "Authentication is required.");
  }

  const userId = session.user.id;
  const resolution = await getPermissions(userId, input.context);
  const allowed = canAccess(resolution, input.permission);

  await recordAuthorizationDecision({
    actorId: userId,
    action: input.action,
    scopeType: input.context.type,
    scopeId: input.context.id,
    targetType: input.targetType,
    targetId: input.targetId,
    permission: input.permission,
    decision: allowed ? "allow" : "deny",
    reason: allowed ? undefined : "permission_missing",
  });

  if (!allowed) {
    throw new AuthorizationError(403, "You do not have permission to perform this action.");
  }

  if (input.highRisk) {
    const approved = canAccess(resolution, "high_risk.approve");

    if (!approved) {
      await recordAuthorizationDecision({
        actorId: userId,
        action: input.action,
        scopeType: input.context.type,
        scopeId: input.context.id,
        targetType: input.targetType,
        targetId: input.targetId,
        permission: "high_risk.approve",
        decision: "deny",
        reason: "high_risk_approval_required",
      });

      throw new AuthorizationError(
        403,
        "This action requires additional high-risk authorization.",
      );
    }
  }

  return {
    session,
    resolution,
  };
}

export async function requireVerifiedOrganization(
  context: AccessContext,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
) {
  const organizationId = await resolveOrganizationIdFromContext(context);
  if (!organizationId) {
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      kycStatus: true,
    },
  });

  if (organization?.kycStatus === "VERIFIED") {
    return;
  }

  await recordAuthorizationDecision({
    actorId,
    action,
    scopeType: context.type,
    scopeId: context.id,
    targetType,
    targetId,
    permission: "org.verified.action",
    decision: "deny",
    reason: "organization_not_verified",
  });

  throw new AuthorizationError(
    403,
    "Organization must be verified before this action is allowed.",
  );
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
      },
      {
        status: error.status,
      },
    );
  }

  const fallbackMessage =
    error instanceof Error ? error.message : "Unexpected server error.";

  return Response.json(
    {
      error: fallbackMessage,
      code: "INTERNAL_SERVER_ERROR",
    },
    {
      status: 500,
    },
  );
}
