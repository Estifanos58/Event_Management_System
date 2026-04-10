import { ScopeType } from "@prisma/client";
import { runOperationalAlertSweep } from "@/core/ops/alerts";
import { runApiWithObservability } from "@/core/observability/http";
import {
  createAccessContext,
  requirePermission,
  toErrorResponse,
} from "@/domains/identity/guards";

export async function GET(request: Request) {
  return runApiWithObservability(request, "ops.alerts.get", async () => {
    try {
      await requirePermission({
        context: createAccessContext(ScopeType.PLATFORM, "platform"),
        permission: "platform.admin",
        action: "ops.alerts.read",
        targetType: "Platform",
        targetId: "platform",
      });

      const url = new URL(request.url);
      const forceEmit = url.searchParams.get("forceEmit") === "true";
      const windowMinutesRaw = url.searchParams.get("windowMinutes");
      const windowMinutes = windowMinutesRaw ? Number(windowMinutesRaw) : undefined;

      const result = await runOperationalAlertSweep({
        forceEmit,
        windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : undefined,
      });

      return Response.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
