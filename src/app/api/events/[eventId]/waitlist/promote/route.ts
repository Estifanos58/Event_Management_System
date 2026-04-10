import { ScopeType } from "@prisma/client";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { toTicketingErrorResponse } from "@/domains/ticketing/errors";
import { promoteWaitlist } from "@/domains/ticketing/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    await requirePermission({
      context: createAccessContext(ScopeType.EVENT, eventId),
      permission: "ticket.manage",
      action: "ticketing.waitlist.promote",
      targetType: "Event",
      targetId: eventId,
    });

    const result = await promoteWaitlist(eventId);

    return Response.json({
      result,
    });
  } catch (error) {
    return toTicketingErrorResponse(error);
  }
}
