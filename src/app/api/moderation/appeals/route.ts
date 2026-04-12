import { toModerationErrorResponse } from "@/domains/moderation/errors";
import {
  createModerationAppeal,
  listModerationAppeals,
} from "@/domains/moderation/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listModerationAppeals({
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
    const result = await createModerationAppeal(body);

    return Response.json(
      {
        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
