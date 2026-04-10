import { enqueueTransactionalNotification } from "@/domains/notifications/service";
import { toNotificationErrorResponse } from "@/domains/notifications/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await enqueueTransactionalNotification(eventId, body);

    return Response.json({
      result,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}
