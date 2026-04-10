import { toEventErrorResponse } from "@/domains/events/errors";
import { setEventTicketSalesPaused } from "@/domains/events/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const event = await setEventTicketSalesPaused(eventId, body);

    return Response.json({
      event,
    });
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
