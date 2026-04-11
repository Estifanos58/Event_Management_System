import "dotenv/config";

import { runComplianceMaintenance } from "../domains/compliance/service";
import { env } from "../core/env";
import { runIntegrationsMaintenance } from "../domains/integrations/service";
import { runNotificationsMaintenance } from "../domains/notifications/service";
import { reconcilePendingRefunds } from "../domains/payments/service";
import { runTicketingMaintenance } from "../domains/ticketing/service";
import { runOperationalAlertSweep } from "../core/ops/alerts";
import { logError, logInfo } from "../core/observability/logger";
import { withObservabilityContext } from "../core/observability/context";
import { withTraceSpan } from "../core/observability/tracing";

logInfo("worker.bootstrap.complete", {
  redisUrl: env.REDIS_URL,
});

async function runWorkerTick() {
  const heartbeatAt = new Date().toISOString();
  const correlationId = `worker-${heartbeatAt}`;

  await withObservabilityContext(
    {
      correlationId,
      traceId: correlationId,
      route: "worker.tick",
      method: "WORKER",
      actorId: "system",
      tenantScope: {
        type: "PLATFORM",
        id: "platform",
      },
    },
    async () => {
      logInfo("worker.heartbeat", {
        heartbeatAt,
      });

      try {
        await withTraceSpan("worker.tick", async () => {
          const integrationsResult = await runIntegrationsMaintenance();
          const notificationsResult = await runNotificationsMaintenance();
          const refundReconciliationResult = await reconcilePendingRefunds();
          const ticketingResult = await runTicketingMaintenance();
          const complianceResult = await runComplianceMaintenance();
          const operationalResult = await runOperationalAlertSweep();

          if (integrationsResult.processed > 0 || integrationsResult.purged > 0) {
            logInfo("worker.integrations.maintenance", integrationsResult);
          }

          if (
            notificationsResult.processed > 0 ||
            notificationsResult.queuedReminders > 0
          ) {
            logInfo("worker.notifications.maintenance", notificationsResult);
          }

          if (refundReconciliationResult.checked > 0) {
            logInfo("worker.refunds.reconciliation", refundReconciliationResult);
          }

          if (
            ticketingResult.expiredReservations > 0 ||
            ticketingResult.promotedWaitlistEntries > 0 ||
            ticketingResult.expiredTransfers > 0 ||
            ticketingResult.expiredWaitlistClaims > 0 ||
            ticketingResult.reconciledPaymentAttempts > 0 ||
            ticketingResult.cancelledProviderTransactions > 0 ||
            ticketingResult.rotatedLegacyQrTokens > 0
          ) {
            logInfo("worker.ticketing.maintenance", ticketingResult);
          }

          if (
            complianceResult.expiredExports > 0 ||
            complianceResult.purgedExports > 0 ||
            complianceResult.redactedInboundPayloads > 0 ||
            complianceResult.prunedNotificationDeliveries > 0 ||
            complianceResult.completedDeletionRequests > 0 ||
            complianceResult.rejectedDeletionRequests > 0
          ) {
            logInfo("worker.compliance.maintenance", complianceResult);
          }

          if (operationalResult.emittedAlerts.length > 0) {
            logInfo("worker.ops.alerts.emitted", {
              count: operationalResult.emittedAlerts.length,
              alerts: operationalResult.emittedAlerts.map((alert) => ({
                code: alert.code,
                severity: alert.severity,
              })),
            });
          }
        });
      } catch (error) {
        logError("worker.maintenance.failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    },
  );
}

const intervalId = setInterval(runWorkerTick, 60_000);

process.on("SIGTERM", () => {
  clearInterval(intervalId);
  logInfo("worker.shutdown.sigterm", {});
  process.exit(0);
});
