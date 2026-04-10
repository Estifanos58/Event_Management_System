import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { getActiveReservationForUser } from "@/domains/ticketing/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const reservation = await getActiveReservationForUser(eventId);

    return Response.json({
      reservation,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
