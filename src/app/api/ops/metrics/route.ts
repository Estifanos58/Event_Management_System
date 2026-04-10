import { ScopeType } from "@prisma/client";
import { collectOperationalMetricsSnapshot } from "@/core/ops/metrics-snapshot";
import { runApiWithObservability } from "@/core/observability/http";
import { getMetricsSnapshot } from "@/core/observability/metrics";
import {
  createAccessContext,
  requirePermission,
  toErrorResponse,
} from "@/domains/identity/guards";

export async function GET(request: Request) {
  return runApiWithObservability(request, "ops.metrics.get", async () => {
    try {
      await requirePermission({
        context: createAccessContext(ScopeType.PLATFORM, "platform"),
        permission: "platform.admin",
        action: "ops.metrics.read",
        targetType: "Platform",
        targetId: "platform",
      });

      const url = new URL(request.url);
      const windowMinutesRaw = url.searchParams.get("windowMinutes");
      const windowMinutes = windowMinutesRaw ? Number(windowMinutesRaw) : undefined;

      const [operationalSnapshot, observabilitySnapshot] = await Promise.all([
        collectOperationalMetricsSnapshot({
          windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : undefined,
        }),
        getMetricsSnapshot(),
      ]);

      return Response.json({
        operationalSnapshot,
        observabilitySnapshot,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
