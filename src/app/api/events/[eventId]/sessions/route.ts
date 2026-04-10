import { toEventErrorResponse } from "@/domains/events/errors";
import { createEventSession } from "@/domains/events/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const session = await createEventSession(eventId, body);

    return Response.json(
      {
        session,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
