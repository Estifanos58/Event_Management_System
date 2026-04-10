import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import {
  listSupportedWebhookEventTopics,
  listWebhookOutboxEvents,
  publishWebhookEvent,
} from "@/domains/integrations/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);

    const events = await listWebhookOutboxEvents(eventId, {
      status: url.searchParams.get("status") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });

    return Response.json({
      supportedEventTypes: listSupportedWebhookEventTopics(),
      events,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await publishWebhookEvent(eventId, body);

    return Response.json(
      {
        result,
      },
      {
        status: result.idempotent ? 200 : 201,
      },
    );
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
