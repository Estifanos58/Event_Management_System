import { ScopeType } from "@prisma/client";
import { createAccessContext, requirePermission } from "@/domains/identity/guards";
import { toIntegrationErrorResponse } from "@/domains/integrations/errors";
import { runIntegrationsMaintenance } from "@/domains/integrations/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    await requirePermission({
      context: createAccessContext(ScopeType.EVENT, eventId),
      permission: "event.manage",
      action: "integrations.maintenance.run",
      targetType: "Event",
      targetId: eventId,
    });

    const result = await runIntegrationsMaintenance(eventId);

    return Response.json({
      result,
    });
  } catch (error) {
    return toIntegrationErrorResponse(error);
  }
}
