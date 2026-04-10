import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { getEventTrustSignals } from "@/domains/moderation/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const trustSignals = await getEventTrustSignals(eventId);

    return Response.json({
      trustSignals,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
