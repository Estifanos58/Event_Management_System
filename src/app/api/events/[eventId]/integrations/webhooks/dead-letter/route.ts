import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import { listWebhookDeadLetters } from "@/domains/integrations/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);

    const deadLetters = await listWebhookDeadLetters(
      eventId,
      Number(url.searchParams.get("take") ?? "100"),
    );

    return Response.json({
      deadLetters,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
