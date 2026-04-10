import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { TicketingDomainError, toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { createCheckoutOrder } from "@/domains/ticketing/service";
import type { CheckoutInput } from "@/domains/ticketing/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return runApiWithObservability(request, "events.checkout.create", async () => {
    try {
      const { eventId } = await params;

      const rateLimitResponse = await enforceApiRateLimit(request, {
        namespace: "event_checkout",
        maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
        keyParts: [eventId],
      });

      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const body = (await request.json()) as {
        reservationId?: string;
      } & Record<string, unknown>;

      const reservationId = body.reservationId?.trim();

      if (!reservationId) {
        throw new TicketingDomainError(
          400,
          "BAD_REQUEST",
          "reservationId is required for checkout.",
        );
      }

      const order = await createCheckoutOrder(
        eventId,
        reservationId,
        body as unknown as CheckoutInput,
      );

      return Response.json(
        {
          order,
        },
        {
          status: 201,
        },
      );
    } catch (error) {
      return toTicketingErrorResponse(error);
    }
  });
}
