import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { getMyEventTickets } from "@/domains/ticketing/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const tickets = await getMyEventTickets(eventId);

    return Response.json({
      tickets,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
