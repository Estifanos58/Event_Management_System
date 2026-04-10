import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from "@/domains/notifications/service";
import { toNotificationErrorResponse } from "@/domains/notifications/errors";

export async function GET() {
  try {
    const preferences = await getMyNotificationPreferences();

    return Response.json({
      preferences,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const preferences = await updateMyNotificationPreferences(body);

    return Response.json({
      preferences,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}
