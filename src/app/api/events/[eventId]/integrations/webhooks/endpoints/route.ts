import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from "@/domains/integrations/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const endpoints = await listWebhookEndpoints(eventId);

    return Response.json({
      endpoints,
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

    const endpoint = await createWebhookEndpoint(eventId, body);

    return Response.json(
      {
        endpoint,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
