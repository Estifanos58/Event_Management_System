import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { createModerationCase, listModerationCases } from "@/domains/moderation/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);
    const query = {
      status: url.searchParams.get("status") ?? undefined,
      severity: url.searchParams.get("severity") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    };

    const cases = await listModerationCases(eventId, query);

    return Response.json({
      cases,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const riskCase = await createModerationCase(eventId, body);

    return Response.json(
      {
        riskCase,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
