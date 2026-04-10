import { env } from "@/core/env";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { executeOrderRefund } from "@/domains/payments/service";
import type { ExecuteOrderRefundInput } from "@/domains/payments/types";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; orderId: string }> },
) {
  try {
    const { eventId, orderId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "event_refund_execute",
      maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [eventId, orderId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await executeOrderRefund(
      eventId,
      orderId,
      body as ExecuteOrderRefundInput,
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
