import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { transitionEventPayoutStatus } from "@/domains/payments/service";
import type { TransitionPayoutInput } from "@/domains/payments/types";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; payoutId: string }> },
) {
  try {
    const { eventId, payoutId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const payout = await transitionEventPayoutStatus(
      eventId,
      payoutId,
      body as TransitionPayoutInput,
    );

    return Response.json({
      payout,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
