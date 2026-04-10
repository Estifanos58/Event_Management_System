import { env } from "@/core/env";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { joinWaitlist } from "@/domains/ticketing/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "event_waitlist_join",
      maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [eventId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();

    const waitlistEntry = await joinWaitlist(eventId, body);

    return Response.json(
      {
        waitlistEntry,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
