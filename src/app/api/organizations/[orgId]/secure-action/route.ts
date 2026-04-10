import { ScopeType } from "@prisma/client";
import { env } from "@/core/env";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import {
  createAccessContext,
  requirePermission,
  requireVerifiedOrganization,
  toErrorResponse,
} from "@/domains/identity/guards";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "organization_secure_action",
      maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [orgId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const context = createAccessContext(ScopeType.ORGANIZATION, orgId);
    const { session } = await requirePermission({
      context,
      permission: "org.manage",
      action: "organization.secure_action.execute",
      targetType: "Organization",
      targetId: orgId,
      highRisk: true,
    });

    await requireVerifiedOrganization(
      context,
      session.user.id,
      "organization.secure_action.execute",
      "Organization",
      orgId,
    );

    return Response.json({
      success: true,
      organizationId: orgId,
      performedBy: session.user.id,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
