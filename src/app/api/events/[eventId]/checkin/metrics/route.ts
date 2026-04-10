import { toCheckInErrorResponse } from "@/domains/checkin/errors";
import { getCheckInMetrics } from "@/domains/checkin/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const metrics = await getCheckInMetrics(eventId);

    return Response.json({
      metrics,
    });
  } catch (error) {
    return toCheckInErrorResponse(error);
  }
}
