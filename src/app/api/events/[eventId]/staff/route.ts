import { toEventErrorResponse } from "@/domains/events/errors";
import { assignEventStaff } from "@/domains/events/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = await request.json();

    const assignment = await assignEventStaff(eventId, body);

    return Response.json(
      {
        assignment,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toEventErrorResponse(error);
  }
}
