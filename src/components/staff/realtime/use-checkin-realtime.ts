"use client";

import { useEffect, useMemo, useState } from "react";
import { WS_EVENTS, type WsEnvelope } from "@/core/ws/events";
import type { CheckInMetricsSnapshot } from "@/components/staff/checkin/types";

export type RealtimeConnectionState =
  | "authenticating"
  | "connected"
  | "disconnected"
  | "error";

export type RealtimeFeedItem = {
  id: string;
  type: string;
  channel?: string;
  occurredAt: string;
  summary: string;
};

type WsAuthPayload = {
  token: string;
  wsUrl: string;
  channels: {
    checkIn: string;
    gatePrefix: string;
    incidents: string;
  };
};

type UseCheckInRealtimeResult = {
  connectionState: RealtimeConnectionState;
  connectionMessage: string;
  metrics: CheckInMetricsSnapshot | null;
  feed: RealtimeFeedItem[];
  channels: WsAuthPayload["channels"] | null;
};

function summarizeEnvelope(envelope: WsEnvelope) {
  if (envelope.type === WS_EVENTS.CHECKIN_UPDATED) {
    return "Check-in metrics updated";
  }

  if (envelope.type === WS_EVENTS.GATE_LOAD_UPDATED) {
    return "Gate load updated";
  }

  if (envelope.type === WS_EVENTS.INCIDENT_LOGGED) {
    return "New incident reported";
  }

  if (envelope.type === WS_EVENTS.SYSTEM_ERROR) {
    return "Realtime system error";
  }

  if (envelope.type === WS_EVENTS.SYSTEM_PONG) {
    return "Heartbeat received";
  }

  if (envelope.type === WS_EVENTS.SYSTEM_CONNECTED) {
    return "Realtime connected";
  }

  return envelope.type;
}

function parseMetricsFromEnvelope(envelope: WsEnvelope): CheckInMetricsSnapshot | null {
  const payload = envelope.payload;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const asRecord = payload as {
    metrics?: CheckInMetricsSnapshot;
  };

  return asRecord.metrics ?? null;
}

export function useCheckInRealtime(eventId: string): UseCheckInRealtimeResult {
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("authenticating");
  const [connectionMessage, setConnectionMessage] =
    useState("Requesting realtime auth token...");
  const [metrics, setMetrics] = useState<CheckInMetricsSnapshot | null>(null);
  const [channels, setChannels] = useState<WsAuthPayload["channels"] | null>(null);
  const [feed, setFeed] = useState<RealtimeFeedItem[]>([]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let isDisposed = false;

    async function connect() {
      try {
        const response = await fetch(`/api/events/${eventId}/checkin/ws-token`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => ({}))) as {
          wsAuth?: WsAuthPayload;
          error?: string;
        };

        if (!response.ok || !payload.wsAuth) {
          throw new Error(payload.error ?? "Unable to issue realtime auth token.");
        }

        if (isDisposed) {
          return;
        }

        setChannels(payload.wsAuth.channels);
        setConnectionMessage("Opening realtime socket...");

        socket = new WebSocket(payload.wsAuth.wsUrl);

        socket.addEventListener("open", () => {
          if (!socket || isDisposed) {
            return;
          }

          setConnectionMessage("Authenticating websocket connection...");
          socket.send(
            JSON.stringify({
              type: "auth",
              payload: {
                token: payload.wsAuth?.token,
              },
            }),
          );

          socket.send(
            JSON.stringify({
              type: "subscribe",
              channel: payload.wsAuth?.channels.checkIn,
            }),
          );

          socket.send(
            JSON.stringify({
              type: "subscribe",
              channel: payload.wsAuth?.channels.incidents,
            }),
          );
        });

        socket.addEventListener("message", (messageEvent) => {
          try {
            const envelope = JSON.parse(messageEvent.data) as WsEnvelope;

            if (envelope.type === WS_EVENTS.SYSTEM_CONNECTED) {
              const info = envelope.payload as { authenticated?: boolean } | undefined;

              if (info?.authenticated) {
                setConnectionState("connected");
                setConnectionMessage("Realtime connected");
              }
            }

            if (envelope.type === WS_EVENTS.SYSTEM_ERROR) {
              const errorPayload = envelope.payload as { message?: string } | undefined;
              setConnectionState("error");
              setConnectionMessage(errorPayload?.message ?? "Realtime error");
            }

            const nextMetrics = parseMetricsFromEnvelope(envelope);
            if (nextMetrics) {
              setMetrics(nextMetrics);
            }

            const item: RealtimeFeedItem = {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              type: envelope.type,
              channel: envelope.channel,
              occurredAt: new Date().toISOString(),
              summary: summarizeEnvelope(envelope),
            };

            setFeed((previous) => [item, ...previous].slice(0, 40));
          } catch {
            setConnectionState("error");
            setConnectionMessage("Failed to parse realtime event payload.");
          }
        });

        socket.addEventListener("close", () => {
          if (isDisposed) {
            return;
          }

          setConnectionState("disconnected");
          setConnectionMessage("Realtime socket disconnected.");
        });

        socket.addEventListener("error", () => {
          if (isDisposed) {
            return;
          }

          setConnectionState("error");
          setConnectionMessage("Realtime socket error.");
        });
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setConnectionState("error");
        setConnectionMessage(
          error instanceof Error ? error.message : "Realtime connection failed.",
        );
      }
    }

    void connect();

    return () => {
      isDisposed = true;
      if (socket) {
        socket.close();
      }
    };
  }, [eventId]);

  return useMemo(
    () => ({
      connectionState,
      connectionMessage,
      metrics,
      feed,
      channels,
    }),
    [channels, connectionMessage, connectionState, feed, metrics],
  );
}
