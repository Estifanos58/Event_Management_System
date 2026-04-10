import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import { replayWebhookEvents } from "@/domains/integrations/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const replay = await replayWebhookEvents(eventId, body);

    return Response.json({
      replay,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
