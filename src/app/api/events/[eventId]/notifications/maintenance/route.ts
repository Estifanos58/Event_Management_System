import { ScopeType } from "@prisma/client";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { toNotificationErrorResponse } from "@/domains/notifications/errors";
import { runNotificationsMaintenance } from "@/domains/notifications/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    await requirePermission({
      context: createAccessContext(ScopeType.EVENT, eventId),
      permission: "event.manage",
      action: "notifications.maintenance.run",
      targetType: "Event",
      targetId: eventId,
    });

    const result = await runNotificationsMaintenance(eventId);

    return Response.json({
      result,
    });
  } catch (error) {
    return toNotificationErrorResponse(error);
  }
}
