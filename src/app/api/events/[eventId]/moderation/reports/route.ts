import { toModerationErrorResponse } from "@/domains/moderation/errors";
import { listAbuseReports, submitAbuseReport } from "@/domains/moderation/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);
    const query = {
      status: url.searchParams.get("status") ?? undefined,
      targetType: url.searchParams.get("targetType") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    };

    const reports = await listAbuseReports(eventId, query);

    return Response.json({
      reports,
    });
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await submitAbuseReport(eventId, body);

    return Response.json(
      {
        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toModerationErrorResponse(error);
  }
}
