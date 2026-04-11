import crypto from "node:crypto";
import { env } from "@/core/env";

function normalizeSignature(input: string) {
  const trimmed = input.trim().toLowerCase();
  const withoutPrefix = trimmed.startsWith("sha256=")
    ? trimmed.slice("sha256=".length)
    : trimmed;

  if (!/^[a-f0-9]+$/.test(withoutPrefix)) {
    return null;
  }

  return withoutPrefix;
}

export function verifyChapaPayloadSignature(input: {
  rawBody: string;
  signature: string | null | undefined;
}) {
  if (!input.signature) {
    return false;
  }

  const normalizedSignature = normalizeSignature(input.signature);

  if (!normalizedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.CHAPA_WEBHOOK_SECRET)
    .update(input.rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const providedBuffer = Buffer.from(normalizedSignature, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
