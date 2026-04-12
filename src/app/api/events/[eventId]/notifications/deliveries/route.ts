import { listEventNotificationDeliveries } from "@/domains/notifications/service";
import { toNotificationErrorResponse } from "@/domains/notifications/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const url = new URL(request.url);

    const result = await listEventNotificationDeliveries(eventId, {
      type: url.searchParams.get("type") ?? undefined,
      channel: url.searchParams.get("channel") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return Response.json({
      result,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}
