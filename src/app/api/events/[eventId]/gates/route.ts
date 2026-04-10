import { toEventErrorResponse } from "@/domains/events/errors";
import { createEventGate } from "@/domains/events/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const gate = await createEventGate(eventId, body);

    return Response.json(
      {
        gate,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
