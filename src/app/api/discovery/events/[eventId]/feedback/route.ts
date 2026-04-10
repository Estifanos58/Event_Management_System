import { toDiscoveryErrorResponse } from "@/domains/discovery/errors";
import {
  getEventFeedbackStatus,
  submitEventFeedback,
} from "@/domains/discovery/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const result = await getEventFeedbackStatus(eventId);

    return Response.json({
      result,
    });
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await submitEventFeedback(eventId, body);

    return Response.json(
      {
        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toDiscoveryErrorResponse(error);
  }
}
