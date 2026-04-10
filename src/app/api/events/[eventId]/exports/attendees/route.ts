import { env } from "@/core/env";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import {
  createEventAttendeeExportJob,
  listEventAttendeeExportJobs,
} from "@/domains/compliance/service";
import { toComplianceErrorResponse } from "@/domains/compliance/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "event_attendee_export_list",
      maxRequests: env.SECURITY_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [eventId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const url = new URL(request.url);

    const jobs = await listEventAttendeeExportJobs(eventId, {
      take: url.searchParams.get("take") ?? undefined,
    });

    return Response.json({
      jobs,
    });
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "event_attendee_export_create",
      maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [eventId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const job = await createEventAttendeeExportJob(eventId, body);

    return Response.json(
      {
        job,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}
