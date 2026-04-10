import { redis } from "../redis/client";
import {
  WS_BROADCAST_REDIS_CHANNEL,
  type WsBroadcastMessage,
  type WsEnvelope,
} from "./events";

async function ensureRedisReady() {
  if (redis.status === "ready") {
    return;
  }

  if (redis.status === "connecting") {
    return;
  }

  await redis.connect();
}

export async function publishWsChannelEvent(
  channel: string,
  event: WsEnvelope,
): Promise<boolean> {
  const message: WsBroadcastMessage = {
    channel,
    event,
  };

  try {
    await ensureRedisReady();

    await redis.publish(WS_BROADCAST_REDIS_CHANNEL, JSON.stringify(message));
    return true;
  } catch (error) {
    console.warn("Failed to publish WebSocket channel event", {
      channel,
      eventType: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });

    return false;
  }
}
