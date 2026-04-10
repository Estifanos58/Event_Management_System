import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPhase15ValidationReport,
  type Phase15ValidationInput,
} from "./phase15-validation";

function passingProfile(): Phase15ValidationInput {
  return {
    profileName: "phase15-test-profile",
    observedAt: "2026-04-07T00:00:00.000Z",
    load: {
      concurrentBuyers: 11_200,
      reservationThroughputPerMinute: 2_250,
      checkinBurstPerSecond: 105,
      notificationBurstMessages: 102_500,
      reservationP95Ms: 320,
      checkoutToPaymentInitP95Ms: 590,
      ticketIssuanceP95Seconds: 46,
      checkinValidationP95Ms: 205,
    },
    failureRecovery: {
      paymentGatewayTimeoutInjected: true,
      webhookConsumerFailureInjected: true,
      notificationDependencyFailureInjected: true,
      alertingValidated: true,
      backlogRecoveredMinutes: 90,
      reconciliationCompleted: true,
      duplicateTicketIssuanceDetected: false,
    },
    continuity: {
      rtoMinutes: 45,
      rpoMinutes: 4,
      degradedCheckinModeActivated: true,
      manualGateFallbackActivated: true,
      offlineSyncConvergenceMinutes: 4,
    },
  };
}

test("buildPhase15ValidationReport passes for a compliant profile", () => {
  const report = buildPhase15ValidationReport(passingProfile());

  assert.equal(report.passed, true);
  assert.equal(report.failedChecks.length, 0);
});

test("buildPhase15ValidationReport fails when load assumptions are not met", () => {
  const profile = passingProfile();
  profile.load.reservationThroughputPerMinute = 1_650;

  const report = buildPhase15ValidationReport(profile);
  const throughputCheck = report.failedChecks.find(
    (check) => check.id === "load.reservation_throughput",
  );

  assert.equal(report.passed, false);
  assert.equal(Boolean(throughputCheck), true);
});

test("buildPhase15ValidationReport fails when failure recovery exceeds limits", () => {
  const profile = passingProfile();
  profile.failureRecovery.backlogRecoveredMinutes = 145;

  const report = buildPhase15ValidationReport(profile);
  const recoveryCheck = report.failedChecks.find(
    (check) => check.id === "failure.backlog_recovery",
  );

  assert.equal(report.passed, false);
  assert.equal(Boolean(recoveryCheck), true);
});

test("buildPhase15ValidationReport fails when continuity objectives are violated", () => {
  const profile = passingProfile();
  profile.continuity.rpoMinutes = 9;
  profile.continuity.offlineSyncConvergenceMinutes = 8;

  const report = buildPhase15ValidationReport(profile);
  const rpoCheck = report.failedChecks.find((check) => check.id === "continuity.rpo");
  const convergenceCheck = report.failedChecks.find(
    (check) => check.id === "continuity.offline_sync_convergence",
  );

  assert.equal(report.passed, false);
  assert.equal(Boolean(rpoCheck), true);
  assert.equal(Boolean(convergenceCheck), true);
});
