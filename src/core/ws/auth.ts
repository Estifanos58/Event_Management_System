import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../env";

const wsAuthTokenSchema = z.object({
  sub: z.string().trim().min(1, "User id is required."),
  eventId: z.string().trim().min(1, "Event id is required."),
  permissions: z.object({
    metrics: z.boolean(),
    incident: z.boolean(),
  }),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().trim().min(1),
});

export type WsAuthClaims = z.infer<typeof wsAuthTokenSchema>;

export type CreateWsAuthTokenInput = {
  userId: string;
  eventId: string;
  permissions: {
    metrics: boolean;
    incident: boolean;
  };
  ttlSeconds?: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

export function createWsAuthToken(input: CreateWsAuthTokenInput) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttlSeconds = input.ttlSeconds ?? 5 * 60;
  const expiresAtEpoch = issuedAt + ttlSeconds;

  const payload: WsAuthClaims = {
    sub: input.userId,
    eventId: input.eventId,
    permissions: {
      metrics: input.permissions.metrics,
      incident: input.permissions.incident,
    },
    iat: issuedAt,
    exp: expiresAtEpoch,
    jti: crypto.randomUUID(),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAtEpoch * 1000),
  };
}

export function verifyWsAuthToken(token: string): WsAuthClaims {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    throw new Error("Invalid token format.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(encodedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid token signature.");
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature.");
  }

  let decodedPayload: unknown;

  try {
    decodedPayload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new Error("Invalid token payload.");
  }

  const claims = wsAuthTokenSchema.parse(decodedPayload);
  const nowEpoch = Math.floor(Date.now() / 1000);

  if (claims.exp <= nowEpoch) {
    throw new Error("Token expired.");
  }

  return claims;
}
