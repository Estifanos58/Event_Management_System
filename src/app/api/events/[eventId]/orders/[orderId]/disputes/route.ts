import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { recordPaymentDispute } from "@/domains/payments/service";
import type { RecordPaymentDisputeInput } from "@/domains/payments/types";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; orderId: string }> },
) {
  try {
    const { eventId, orderId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await recordPaymentDispute(
      eventId,
      orderId,
      body as RecordPaymentDisputeInput,
    );

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
