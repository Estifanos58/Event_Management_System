export const WS_EVENTS = {
  SYSTEM_CONNECTED: "system.connected",
  SYSTEM_PONG: "system.pong",
  SYSTEM_ERROR: "system.error",
  CHECKIN_UPDATED: "checkin.updated",
  GATE_LOAD_UPDATED: "gate.load.updated",
  INCIDENT_LOGGED: "incident.logged",
} as const;

export const WS_BROADCAST_REDIS_CHANNEL = "ws:broadcast";

export const WS_CHANNELS = {
  SYSTEM: "system",
  eventCheckIn: (eventId: string) => `event:${eventId}:checkin`,
  eventGateLoad: (eventId: string, gateId: string) =>
    `event:${eventId}:gate:${gateId}`,
  eventIncidents: (eventId: string) => `event:${eventId}:incident`,
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
export type WsControlMessageName = "subscribe" | "unsubscribe" | "ping" | "auth";

export interface WsEnvelope<T = unknown> {
  type: WsEventName | WsControlMessageName;
  channel?: string;
  payload?: T;
}

export interface WsBroadcastMessage {
  channel: string;
  event: WsEnvelope;
}
