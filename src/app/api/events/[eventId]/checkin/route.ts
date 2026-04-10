import { runApiWithObservability } from "@/core/observability/http";
import { toCheckInErrorResponse } from "@/domains/checkin/errors";
import { scanTicketAtGate } from "@/domains/checkin/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return runApiWithObservability(request, "events.checkin.scan", async () => {
    try {
      const { eventId } = await params;
      const body = await request.json();

      const result = await scanTicketAtGate(eventId, body);

      return Response.json({
        result,
      });
    } catch (error) {
      return toCheckInErrorResponse(error);
    }
  });
}
