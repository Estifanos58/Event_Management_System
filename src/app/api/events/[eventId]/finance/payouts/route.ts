import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { scheduleEventPayout } from "@/domains/payments/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await scheduleEventPayout(eventId, body);

    return Response.json(
      {
        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
