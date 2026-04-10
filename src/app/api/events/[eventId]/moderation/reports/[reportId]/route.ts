import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { updateAbuseReportStatus } from "@/domains/moderation/service";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; reportId: string }> },
) {
  try {
    const { eventId, reportId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await updateAbuseReportStatus(eventId, reportId, body);

    return Response.json({
      result,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
