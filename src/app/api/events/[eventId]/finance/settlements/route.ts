import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { createSettlementRecord } from "@/domains/payments/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await createSettlementRecord(eventId, body);

    return Response.json(
      {
        result,
      },
      {
        status: result.reused ? 200 : 201,
      },
    );
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
