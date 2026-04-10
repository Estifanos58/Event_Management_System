import { env } from "@/core/env";
import { enforceApiRateLimit } from "@/core/security/rate-limit";
import { downloadEventAttendeeExport } from "@/domains/compliance/service";
import { toComplianceErrorResponse } from "@/domains/compliance/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; jobId: string }> },
) {
  try {
    const { eventId, jobId } = await params;

    const rateLimitResponse = await enforceApiRateLimit(request, {
      namespace: "event_attendee_export_download",
      maxRequests: env.SECURITY_HIGH_RISK_RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: env.SECURITY_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [eventId, jobId],
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const download = await downloadEventAttendeeExport(eventId, jobId);

    return new Response(download.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${download.fileName}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toComplianceErrorResponse(error);
  }
}
