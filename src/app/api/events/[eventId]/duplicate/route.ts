import { toEventErrorResponse } from "@/domains/events/errors";
import {
  duplicateEventAsDraft,
  parseEventDuplicateMode,
} from "@/domains/events/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const mode = parseEventDuplicateMode(body);
    const event = await duplicateEventAsDraft(eventId, mode);

    return Response.json(
      {
        event,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
