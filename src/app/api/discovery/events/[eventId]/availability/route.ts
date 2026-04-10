import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import { getEventAvailabilitySnapshot } from "@/domains/discovery/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const availability = await getEventAvailabilitySnapshot(eventId);

    return Response.json({
      availability,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
