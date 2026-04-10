import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { createReservation } from "@/domains/ticketing/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return runApiWithObservability(request, "events.reservations.create", async () => {
    try {
      const { eventId } = await params;

      const rateLimitResponse = await enforceApiRateLimit(request, {
        namespace: "event_reservations",
        maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
        keyParts: [eventId],
      });

      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const body = await request.json();

      const reservation = await createReservation(eventId, body);

      return Response.json(
        {
          reservation,
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
