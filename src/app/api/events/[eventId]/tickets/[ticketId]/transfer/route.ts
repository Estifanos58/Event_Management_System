import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { requestTicketTransfer } from "@/domains/ticketing/service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; ticketId: string }> },
) {
  try {
    const { eventId, ticketId } = await params;
    const body = await request.json();

    const transfer = await requestTicketTransfer(eventId, ticketId, body);

    return Response.json(
      {
        transfer,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
