import crypto from "node:crypto";
import { redis } from "@/core/redis/client";

type RateLimitPolicy = {
  namespace: string;
  maxRequests: number;
  windowSeconds: number;
  keyParts?: string[];
};

type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function toBucketKey(request: Request, policy: RateLimitPolicy) {
  const keySource = [policy.namespace, getClientIp(request), ...(policy.keyParts ?? [])]
    .filter((part) => Boolean(part))
    .join(":");

  const digest = crypto.createHash("sha256").update(keySource).digest("hex");
  return `rate_limit:${policy.namespace}:${digest}`;
}

async function evaluateRedisRateLimit(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitDecision> {
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, policy.windowSeconds);
  }

  const ttl = await redis.ttl(key);
  const retryAfterSeconds = ttl > 0 ? ttl : policy.windowSeconds;
  const remaining = Math.max(0, policy.maxRequests - current);
  const resetAt = Date.now() + retryAfterSeconds * 1_000;

  return {
    allowed: current <= policy.maxRequests,
    limit: policy.maxRequests,
    remaining,
    retryAfterSeconds,
    resetAt,
  };
}

function evaluateMemoryRateLimit(
  key: string,
  policy: RateLimitPolicy,
): RateLimitDecision {
  const nowMs = Date.now();
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= nowMs) {
    const resetAt = nowMs + policy.windowSeconds * 1_000;
    memoryBuckets.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit: policy.maxRequests,
      remaining: Math.max(0, policy.maxRequests - 1),
      retryAfterSeconds: policy.windowSeconds,
      resetAt,
    };
  }

  existing.count += 1;
  memoryBuckets.set(key, existing);

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1_000));

  return {
    allowed: existing.count <= policy.maxRequests,
    limit: policy.maxRequests,
    remaining: Math.max(0, policy.maxRequests - existing.count),
    retryAfterSeconds,
    resetAt: existing.resetAt,
  };
}

export async function enforceApiRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  const bucketKey = toBucketKey(request, policy);

  let decision: RateLimitDecision;

  try {
    decision = await evaluateRedisRateLimit(bucketKey, policy);
  } catch {
    decision = evaluateMemoryRateLimit(bucketKey, policy);
  }

  if (decision.allowed) {
    return null;
  }

  return Response.json(
    {
      error: "Rate limit exceeded. Please retry later.",
      code: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(decision.retryAfterSeconds),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": String(decision.remaining),
        "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1_000)),
      },
    },
  );
}
