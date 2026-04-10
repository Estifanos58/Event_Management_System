import {
  createEventDraft,
  getEventsOverviewSnapshot,
} from "@/domains/events/service";
import { toEventErrorResponse } from "@/domains/events/errors";

export async function GET() {
  try {
    const snapshot = await getEventsOverviewSnapshot();

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
      activeContext: snapshot.activeContext,
      canReadEvents: snapshot.canReadEvents,
      canManageEvents: snapshot.canManageEvents,
      events: snapshot.events,
    });
  } catch (error) {
    return toEventErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = await createEventDraft(body);

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
