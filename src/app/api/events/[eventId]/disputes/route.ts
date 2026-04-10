import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { listPaymentDisputes } from "@/domains/payments/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const disputes = await listPaymentDisputes(eventId);

    return Response.json({
      disputes,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
