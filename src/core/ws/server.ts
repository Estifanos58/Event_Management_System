import "dotenv/config";

import { createServer } from "node:http";
import { env } from "../env";
import { createRedisPubSubPair } from "../redis/client";
import { verifyWsAuthToken, type WsAuthClaims } from "./auth";
import {
  WS_BROADCAST_REDIS_CHANNEL,
  WS_EVENTS,
  type WsBroadcastMessage,
  type WsEnvelope,
} from "./events";
import {
  getChannelStats,
  publishToChannel,
  removeSocket,
  subscribeSocket,
  unsubscribeSocket,
} from "./hub";
import { canSubscribeToChannel } from "./policy";
import { WebSocketServer, type WebSocket } from "ws";

function isOriginAllowed(origin: string | undefined) {
  if (!origin) {
    return false;
  }
  return origin === env.WS_ALLOWED_ORIGIN;
}

function toSystemErrorEnvelope(message: string): WsEnvelope<{ message: string }> {
  return {
    type: WS_EVENTS.SYSTEM_ERROR,
    payload: { message },
  };
}

function getAuthTokenFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const tokenValue = (payload as { token?: unknown }).token;

  if (typeof tokenValue !== "string") {
    return null;
  }

  const token = tokenValue.trim();
  return token.length > 0 ? token : null;
}

function isWsBroadcastMessage(value: unknown): value is WsBroadcastMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    channel?: unknown;
    event?: { type?: unknown };
  };

  return (
    typeof payload.channel === "string" &&
    !!payload.event &&
    typeof payload.event.type === "string"
  );
}

const socketClaims = new WeakMap<WebSocket, WsAuthClaims>();
const redisPubSub = createRedisPubSubPair();

async function bootstrapRedisSubscription() {
  try {
    await redisPubSub.sub.connect();
    await redisPubSub.sub.subscribe(WS_BROADCAST_REDIS_CHANNEL);

    redisPubSub.sub.on("message", (_channel, message) => {
      try {
        const parsed = JSON.parse(message) as unknown;

        if (!isWsBroadcastMessage(parsed)) {
          return;
        }

        publishToChannel(parsed.channel, parsed.event);
      } catch {
        console.warn("Failed to parse WebSocket broadcast message from Redis.");
      }
    });
  } catch (error) {
    console.error("WebSocket Redis subscription bootstrap failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

void bootstrapRedisSubscription();

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        channels: getChannelStats(),
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, req) => {
  if (!isOriginAllowed(req.headers.origin)) {
    socket.close(1008, "Origin not allowed");
    return;
  }

  const connectedEnvelope: WsEnvelope = {
    type: WS_EVENTS.SYSTEM_CONNECTED,
    payload: {
      timestamp: new Date().toISOString(),
      authenticated: false,
    },
  };
  socket.send(JSON.stringify(connectedEnvelope));

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as WsEnvelope;

      if (message.type === "auth") {
        const token = getAuthTokenFromPayload(message.payload);

        if (!token) {
          socket.send(
            JSON.stringify(toSystemErrorEnvelope("WebSocket auth token is required.")),
          );
          return;
        }

        try {
          const claims = verifyWsAuthToken(token);
          socketClaims.set(socket, claims);

          socket.send(
            JSON.stringify({
              type: WS_EVENTS.SYSTEM_CONNECTED,
              payload: {
                timestamp: new Date().toISOString(),
                authenticated: true,
                eventId: claims.eventId,
                permissions: claims.permissions,
                expiresAt: new Date(claims.exp * 1000).toISOString(),
              },
            } satisfies WsEnvelope),
          );
        } catch {
          socket.send(
            JSON.stringify(toSystemErrorEnvelope("WebSocket auth token is invalid.")),
          );
        }

        return;
      }

      if (message.type === "ping") {
        const pongEnvelope: WsEnvelope = {
          type: WS_EVENTS.SYSTEM_PONG,
          payload: { timestamp: new Date().toISOString() },
        };
        socket.send(JSON.stringify(pongEnvelope));
        return;
      }

      if (message.type === "subscribe" && message.channel) {
        const claims = socketClaims.get(socket);

        if (!claims) {
          socket.send(
            JSON.stringify(
              toSystemErrorEnvelope(
                "Authenticate first using an auth message before subscribing.",
              ),
            ),
          );
          return;
        }

        if (!canSubscribeToChannel(message.channel, claims)) {
          socket.send(
            JSON.stringify(
              toSystemErrorEnvelope(
                "Not authorized to subscribe to the requested channel.",
              ),
            ),
          );
          return;
        }

        subscribeSocket(socket, message.channel);
        return;
      }

      if (message.type === "unsubscribe" && message.channel) {
        unsubscribeSocket(socket, message.channel);
      }
    } catch {
      socket.send(
        JSON.stringify(toSystemErrorEnvelope("Invalid WebSocket payload.")),
      );
    }
  });

  socket.on("close", () => {
    removeSocket(socket);
  });
});

const heartbeatInterval = setInterval(() => {
  publishToChannel("system", {
    type: WS_EVENTS.SYSTEM_PONG,
    payload: { timestamp: new Date().toISOString() },
  });
}, 30_000);

server.listen(env.WS_PORT, () => {
  console.log(`WebSocket server listening on ws://localhost:${env.WS_PORT}/ws`);
});

process.on("SIGTERM", () => {
  clearInterval(heartbeatInterval);

  Promise.allSettled([redisPubSub.sub.quit(), redisPubSub.pub.quit()]).finally(() => {
    wss.close(() => {
      server.close(() => process.exit(0));
    });
  });
});
