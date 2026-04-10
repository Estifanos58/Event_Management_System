import {
  applyObservabilityHeaders,
  createRequestObservabilityContext,
  withObservabilityContext,
} from "@/core/observability/context";
import { logError, logInfo } from "@/core/observability/logger";
import { incrementCounter, recordDurationSample } from "@/core/observability/metrics";
import { withTraceSpan } from "@/core/observability/tracing";

export async function runApiWithObservability(
  request: Request,
  operation: string,
  handler: () => Promise<Response>,
) {
  const requestContext = createRequestObservabilityContext(request);

  return withObservabilityContext(requestContext, async () => {
    return withTraceSpan(`http.${operation}`, async () => {
      const startedAt = Date.now();

      try {
        const response = await handler();
        const durationMs = Date.now() - startedAt;
        const route = requestContext.route ?? operation;

        await Promise.all([
          incrementCounter("http.request.total", 1, {
            route,
            method: request.method,
            status: response.status,
          }),
          recordDurationSample("http.request.duration_ms", durationMs, {
            route,
            method: request.method,
            status: response.status,
          }),
        ]);

        if (response.status >= 500) {
          await incrementCounter("http.request.error_total", 1, {
            route,
            method: request.method,
          });

          if (route.includes("/checkin")) {
            await incrementCounter("checkin.api.error_total", 1, {
              method: request.method,
            });
          }
        }

        if (route.includes("/checkin")) {
          await Promise.all([
            incrementCounter("checkin.api.request_total", 1, {
              method: request.method,
            }),
            recordDurationSample("checkin.api.duration_ms", durationMs, {
              method: request.method,
            }),
          ]);
        }

        logInfo("http.request.completed", {
          operation,
          route,
          method: request.method,
          status: response.status,
          durationMs,
        });

        return applyObservabilityHeaders(response);
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const route = requestContext.route ?? operation;

        await Promise.all([
          incrementCounter("http.request.error_total", 1, {
            route,
            method: request.method,
          }),
          recordDurationSample("http.request.duration_ms", durationMs, {
            route,
            method: request.method,
            status: "thrown",
          }),
        ]);

        if (route.includes("/checkin")) {
          await incrementCounter("checkin.api.error_total", 1, {
            method: request.method,
          });
        }

        logError("http.request.failed", {
          operation,
          route,
          method: request.method,
          durationMs,
          error: error instanceof Error ? error.message : "unknown",
        });

        throw error;
      }
    });
  });
}
