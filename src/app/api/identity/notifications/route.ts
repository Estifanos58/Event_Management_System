import { listMyNotifications } from "@/domains/notifications/service";
import { toNotificationErrorResponse } from "@/domains/notifications/errors";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const notifications = await listMyNotifications({
      status: url.searchParams.get("status") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });

    return Response.json({
      notifications,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}
