import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import { getDiscoverableEventDetail } from "@/domains/discovery/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const detail = await getDiscoverableEventDetail(eventId);

    if (!detail) {
      return Response.json(
        {
          error: "Event not found.",
          code: "EVENT_NOT_FOUND",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({
      detail,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
