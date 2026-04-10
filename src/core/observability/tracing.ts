import {
  generateSpanId,
  getObservabilityContext,
  withObservabilityContext,
} from "@/core/observability/context";
import { logDebug, logError } from "@/core/observability/logger";
import { recordDurationSample } from "@/core/observability/metrics";

export async function withTraceSpan<T>(
  name: string,
  callback: () => Promise<T>,
  attributes?: Record<string, unknown>,
) {
  const parent = getObservabilityContext();
  const spanId = generateSpanId();

  return withObservabilityContext(
    {
      spanId,
    },
    async () => {
      const startedAt = Date.now();

      logDebug("trace.span.start", {
        spanName: name,
        parentSpanId: parent?.spanId,
        attributes,
      });

      try {
        const result = await callback();
        const durationMs = Date.now() - startedAt;

        await recordDurationSample("trace.span.duration_ms", durationMs, {
          span: name,
        });

        logDebug("trace.span.end", {
          spanName: name,
          durationMs,
          status: "ok",
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;

        await recordDurationSample("trace.span.duration_ms", durationMs, {
          span: name,
        });

        logError("trace.span.error", {
          spanName: name,
          durationMs,
          error: error instanceof Error ? error.message : "unknown",
        });

        throw error;
      }
    },
  );
}
