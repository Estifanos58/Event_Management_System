import { env } from "@/core/env";
import { runApiWithObservability } from "@/core/observability/http";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { toCheckInErrorResponse } from "@/domains/checkin/errors";
import { syncOfflineCheckIns } from "@/domains/checkin/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return runApiWithObservability(request, "events.checkin.sync", async () => {
    try {
      const { eventId } = await params;

      const rateLimitResponse = await enforceApiRateLimit(request, {
        namespace: "event_checkin_sync",
        maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
        keyParts: [eventId],
      });

      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const body = await request.json();

      const result = await syncOfflineCheckIns(eventId, body);

      return Response.json({
        result,
      });
    } catch (error) {
      return toCheckInErrorResponse(error);
    }
  });
}
