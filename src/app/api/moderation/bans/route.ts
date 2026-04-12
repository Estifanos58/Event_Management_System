import { AuthorizationError } from "@/domains/identity/guards";
import { getServerSessionOrNull } from "@/core/auth/session";
import { toModerationErrorResponse } from "@/domains/moderation/errors";
import {
  createModerationBan,
  listActiveBansForUser,
  listModerationBans,
} from "@/domains/moderation/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "true";

    if (mine) {
      const session = await getServerSessionOrNull();

      if (!session) {
        throw new AuthorizationError(401, "Authentication is required.");
      }

      const items = await listActiveBansForUser(session.user.id);

      return Response.json({
        result: {
          items,
          total: items.length,
          page: 1,
          pageSize: items.length,
        },
      });
    }

    const result = await listModerationBans({
      scope: url.searchParams.get("scope") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return Response.json({ result });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await createModerationBan(body);

    return Response.json(
      {
        result,
      },
      {
        status: result.created ? 201 : 200,
      },
    );
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
