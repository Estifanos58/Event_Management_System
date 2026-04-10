import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { transitionModerationCase } from "@/domains/moderation/service";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; riskCaseId: string }> },
) {
  try {
    const { eventId, riskCaseId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const riskCase = await transitionModerationCase(eventId, riskCaseId, body);

    return Response.json({
      riskCase,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
