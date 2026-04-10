import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { claimWaitlistSpot } from "@/domains/ticketing/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const reservation = await claimWaitlistSpot(eventId, body);

    return Response.json({
      reservation,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
