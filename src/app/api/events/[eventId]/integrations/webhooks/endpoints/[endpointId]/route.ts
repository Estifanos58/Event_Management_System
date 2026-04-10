import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import { updateWebhookEndpoint } from "@/domains/integrations/service";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ eventId: string; endpointId: string }> },
) {
  try {
    const { eventId, endpointId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const endpoint = await updateWebhookEndpoint(eventId, endpointId, body);

    return Response.json({
      endpoint,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
