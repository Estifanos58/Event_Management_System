import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { getMyOrderPaymentStatus } from "@/domains/ticketing/service";

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; orderId: string }> },
) {
  return runApiWithObservability(request, "events.payments.status", async () => {
    try {
      const { eventId, orderId } = await params;

      const rateLimitResponse = await enforceApiRateLimit(request, {
        namespace: "event_payment_status",
        maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
        keyParts: [eventId, orderId],
      });

      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const paymentStatus = await getMyOrderPaymentStatus(eventId, orderId);

      return Response.json({
        paymentStatus,
      });
    } catch (error) {
      return toTicketingErrorResponse(error);
    }
  });
}
