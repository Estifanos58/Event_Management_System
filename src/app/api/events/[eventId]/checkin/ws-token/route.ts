import { toCheckInErrorResponse } from "@/domains/checkin/errors";
import { issueCheckInWsAuthToken } from "@/domains/checkin/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const wsAuth = await issueCheckInWsAuthToken(eventId);

    return Response.json({
      wsAuth,
    });
  } catch (error) {
    return toCheckInErrorResponse(error);
  }
}
