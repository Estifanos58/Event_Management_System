import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { cancelTicket } from "@/domains/ticketing/service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; ticketId: string }> },
) {
  try {
    const { eventId, ticketId } = await params;
    const body = await request.json();

    const ticket = await cancelTicket(eventId, ticketId, body);

    return Response.json({
      ticket,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
