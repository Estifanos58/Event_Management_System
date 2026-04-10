import { toEventErrorResponse } from "@/domains/events/errors";
import { createEventTicketClass } from "@/domains/events/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const ticketClass = await createEventTicketClass(eventId, body);

    return Response.json(
      {
        ticketClass,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
