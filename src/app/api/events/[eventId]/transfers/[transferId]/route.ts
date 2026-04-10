import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { respondToTicketTransfer } from "@/domains/ticketing/service";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; transferId: string }> },
) {
  try {
    const { eventId, transferId } = await params;
    const body = await request.json();

    const transfer = await respondToTicketTransfer(eventId, transferId, body);

    return Response.json({
      transfer,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
