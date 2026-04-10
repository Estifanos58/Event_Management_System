import crypto from "node:crypto";
import { env } from "@/core/env";
import { redis } from "@/core/redis/client";
import { IntegrationDomainError } from "@/domains/integrations/errors";

type WebhookReplayProtectionInput = {
  providerType: string;
  provider: string;
  headers: Headers;
  rawBody: string;
  signature?: string | null;
  providerEventId?: string | null;
};

function toTimestampMs(rawValue: string): number | null {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numericValue = Number(trimmed);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    // Unix seconds values are commonly 10 digits.
    return trimmed.length <= 10 ? numericValue * 1_000 : numericValue;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractWebhookTimestamp(headers: Headers): number | null {
  const candidateHeaders = [
    "x-webhook-timestamp",
    "x-chapa-timestamp",
    "x-provider-timestamp",
  ];

  for (const headerName of candidateHeaders) {
    const rawHeader = headers.get(headerName);

    if (!rawHeader) {
      continue;
    }

    const timestampMs = toTimestampMs(rawHeader);

    if (timestampMs === null) {
      throw new IntegrationDomainError(
        400,
        "INVALID_WEBHOOK_TIMESTAMP",
        `Invalid webhook timestamp header: ${headerName}`,
      );
    }

    return timestampMs;
  }

  return null;
}

export async function assertWebhookReplayProtection(
  input: WebhookReplayProtectionInput,
) {
  const timestampMs = extractWebhookTimestamp(input.headers);

  if (timestampMs !== null) {
    const skewSeconds = Math.abs(Date.now() - timestampMs) / 1_000;

    if (skewSeconds > env.SECURITY_WEBHOOK_MAX_CLOCK_SKEW_SECONDS) {
      throw new IntegrationDomainError(
        401,
        "INVALID_WEBHOOK_TIMESTAMP",
        "Webhook timestamp is outside the allowed replay window.",
      );
    }
  }

  const bodyHash = crypto.createHash("sha256").update(input.rawBody).digest("hex");
  const replayKeySource = [
    input.providerType.toUpperCase(),
    input.provider.trim().toUpperCase(),
    input.providerEventId?.trim() ?? "",
    input.signature?.trim() ?? "",
    timestampMs !== null ? String(timestampMs) : "",
    bodyHash,
  ].join(":");

  const replayHash = crypto.createHash("sha256").update(replayKeySource).digest("hex");
  const replayCacheKey = `webhook_replay:${replayHash}`;

  try {
    const cacheResult = await redis.set(
      replayCacheKey,
      "1",
      "EX",
      env.SECURITY_WEBHOOK_REPLAY_WINDOW_SECONDS,
      "NX",
    );

    if (cacheResult !== "OK") {
      throw new IntegrationDomainError(
        409,
        "WEBHOOK_REPLAY_DETECTED",
        "Potential webhook replay detected and blocked.",
      );
    }
  } catch (error) {
    if (error instanceof IntegrationDomainError) {
      throw error;
    }
  }
}
