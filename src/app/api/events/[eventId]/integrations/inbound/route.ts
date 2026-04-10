import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import { listInboundProviderEvents } from "@/domains/integrations/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);

    const inboundEvents = await listInboundProviderEvents(eventId, {
      providerType: url.searchParams.get("providerType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });

    return Response.json({
      inboundEvents,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
