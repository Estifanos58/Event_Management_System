import { runApiWithObservability } from "@/core/observability/http";
import { toCheckInErrorResponse } from "@/domains/checkin/errors";
import { logCheckInIncident } from "@/domains/checkin/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return runApiWithObservability(request, "events.checkin.incidents.create", async () => {
    try {
      const { eventId } = await params;
      const body = await request.json();

      const incident = await logCheckInIncident(eventId, body);

      return Response.json(
        {
          incident,
        },
        {
          status: 201,
        },
      );
    } catch (error) {
      return toCheckInErrorResponse(error);
    }
  });
}
