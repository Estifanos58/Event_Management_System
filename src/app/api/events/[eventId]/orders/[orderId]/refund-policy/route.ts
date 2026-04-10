import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { getOrderRefundPolicyDecision } from "@/domains/payments/service";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; orderId: string }> },
) {
  try {
    const { eventId, orderId } = await params;
    const policy = await getOrderRefundPolicyDecision(eventId, orderId);

    return Response.json({
      policy,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
