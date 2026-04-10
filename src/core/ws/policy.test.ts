import assert from "node:assert/strict";
import test from "node:test";
import { WS_CHANNELS } from "./events";
import { canSubscribeToChannel, isGateMetricsChannelForEvent } from "./policy";

function claims(input?: {
  eventId?: string;
  metrics?: boolean;
  incident?: boolean;
}) {
  return {
    sub: "user-1",
    eventId: input?.eventId ?? "event-1",
    permissions: {
      metrics: input?.metrics ?? true,
      incident: input?.incident ?? false,
    },
    iat: 1,
    exp: 9999999999,
    jti: "token-1",
  };
}

test("isGateMetricsChannelForEvent validates only event-scoped gate channels", () => {
  assert.equal(isGateMetricsChannelForEvent("event:event-1:gate:gate-a", "event-1"), true);
  assert.equal(isGateMetricsChannelForEvent("event:event-2:gate:gate-a", "event-1"), false);
  assert.equal(isGateMetricsChannelForEvent("event:event-1:gate:", "event-1"), false);
  assert.equal(isGateMetricsChannelForEvent("event:event-1:checkin", "event-1"), false);
});

test("canSubscribeToChannel enforces metrics and incident permissions", () => {
  const metricsOnlyClaims = claims({ metrics: true, incident: false });

  assert.equal(canSubscribeToChannel(WS_CHANNELS.SYSTEM, metricsOnlyClaims), true);
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventCheckIn("event-1"), metricsOnlyClaims),
    true,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventGateLoad("event-1", "gate-a"), metricsOnlyClaims),
    true,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventIncidents("event-1"), metricsOnlyClaims),
    false,
  );

  const incidentClaims = claims({ metrics: false, incident: true });

  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventCheckIn("event-1"), incidentClaims),
    false,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventGateLoad("event-1", "gate-a"), incidentClaims),
    false,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventIncidents("event-1"), incidentClaims),
    true,
  );
});

test("canSubscribeToChannel denies cross-event subscriptions", () => {
  const scopedClaims = claims({ eventId: "event-1", metrics: true, incident: true });

  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventCheckIn("event-2"), scopedClaims),
    false,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventGateLoad("event-2", "gate-a"), scopedClaims),
    false,
  );
  assert.equal(
    canSubscribeToChannel(WS_CHANNELS.eventIncidents("event-2"), scopedClaims),
    false,
  );
});