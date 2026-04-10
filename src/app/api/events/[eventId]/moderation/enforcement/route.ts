import { applyModerationEnforcement } from "@/domains/moderation/service";
import { toModerationErrorResponse } from "@/domains/moderation/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await applyModerationEnforcement(eventId, body);

    return Response.json({
      result,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
