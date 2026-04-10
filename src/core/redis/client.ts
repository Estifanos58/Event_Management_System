import Redis from "ioredis";
import { env } from "@/core/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

type RedisWithErrorHandlerFlag = Redis & {
  __errorHandlerAttached?: boolean;
};

let lastRedisErrorLogAt = 0;
const REDIS_ERROR_LOG_THROTTLE_MS = 60_000;

function attachErrorHandler(client: Redis, label: string) {
  const flaggedClient = client as RedisWithErrorHandlerFlag;

  if (flaggedClient.__errorHandlerAttached) {
    return;
  }

  flaggedClient.__errorHandlerAttached = true;

  client.on("error", (error) => {
    const nowMs = Date.now();

    if (nowMs - lastRedisErrorLogAt < REDIS_ERROR_LOG_THROTTLE_MS) {
      return;
    }

    lastRedisErrorLogAt = nowMs;

    console.warn(`[redis:${label}] ${error.message}`);
  });
}

function createRedisClient(label: string) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableAutoPipelining: true,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
  });

  attachErrorHandler(client, label);

  return client;
}

export const redis =
  globalForRedis.redis ??
  createRedisClient("default");

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export function createRedisPubSubPair() {
  const pub = createRedisClient("pub");
  const sub = createRedisClient("sub");

  return {
    pub,
    sub,
  };
}
