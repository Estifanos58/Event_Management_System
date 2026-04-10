import { toEventErrorResponse } from "@/domains/events/errors";
import {
  getEventDetailSnapshot,
  updateEventBasics,
} from "@/domains/events/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const snapshot = await getEventDetailSnapshot(eventId);

    if (!snapshot) {
      return Response.json(
        {
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        },
        {
          status: 401,
        },
      );
    }

    return Response.json({
      event: snapshot.event,
      canManageEvent: snapshot.canManageEvent,
      transitions: snapshot.transitions,
    });
  } catch (error) {
    return toEventErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const event = await updateEventBasics(eventId, body);

    return Response.json({
      event,
    });
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
