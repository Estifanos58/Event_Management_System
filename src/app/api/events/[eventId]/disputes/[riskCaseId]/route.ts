import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { updatePaymentDisputeWorkflow } from "@/domains/payments/service";
import type { UpdatePaymentDisputeWorkflowInput } from "@/domains/payments/types";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; riskCaseId: string }> },
) {
  try {
    const { eventId, riskCaseId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const dispute = await updatePaymentDisputeWorkflow(
      eventId,
      riskCaseId,
      body as UpdatePaymentDisputeWorkflowInput,
    );

    return Response.json({
      dispute,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
