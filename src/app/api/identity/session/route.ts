import { ScopeType } from "@prisma/client";
import {
  getServerSessionOrNull,
  resolveActiveContext,
} from "@/core/auth/session";
import { toErrorResponse } from "@/domains/identity/guards";
import { getPermissions } from "@/domains/identity/permissions";

export async function GET() {
  try {
    const session = await getServerSessionOrNull();

    if (!session) {
      return Response.json(
        {
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        },
        {
          status: 401,
        },
      );
    }

    const activeContext =
      resolveActiveContext(session, session.user.id) ?? {
        type: ScopeType.PERSONAL,
        id: session.user.id,
      };

    const permissionResolution = await getPermissions(session.user.id, activeContext);

    return Response.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image,
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
        activeContextType: activeContext.type,
        activeContextId: activeContext.id,
      },
      roles: permissionResolution.roles,
      permissions: Array.from(permissionResolution.permissions),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
