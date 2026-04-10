import type { WsAuthClaims } from "./auth";
import { WS_CHANNELS } from "./events";

export function isGateMetricsChannelForEvent(channel: string, eventId: string) {
  const parts = channel.split(":");

  return (
    parts.length === 4 &&
    parts[0] === "event" &&
    parts[1] === eventId &&
    parts[2] === "gate" &&
    parts[3].length > 0
  );
}

export function canSubscribeToChannel(channel: string, claims: WsAuthClaims) {
  if (channel === WS_CHANNELS.SYSTEM) {
    return true;
  }

  if (channel === WS_CHANNELS.eventCheckIn(claims.eventId)) {
    return claims.permissions.metrics;
  }

  if (isGateMetricsChannelForEvent(channel, claims.eventId)) {
    return claims.permissions.metrics;
  }

  if (channel === WS_CHANNELS.eventIncidents(claims.eventId)) {
    return claims.permissions.incident;
  }

  return false;
}