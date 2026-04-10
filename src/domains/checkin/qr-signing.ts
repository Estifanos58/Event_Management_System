import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildTicketQrToken,
  parseTicketQrToken,
  type TicketQrPayload,
} from "@/domains/checkin/qr-payload";

function createTicketQrSignature(signingInput: string, secret: string) {
  return createHmac("sha256", secret).update(signingInput).digest("base64url");
}

export function createSignedTicketQrToken(payload: TicketQrPayload, secret: string) {
  const payloadToken = buildTicketQrToken(payload, "placeholder-signature");
  const signatureTarget = payloadToken.split(".").slice(0, 2).join(".");
  const signature = createTicketQrSignature(signatureTarget, secret);

  return `${signatureTarget}.${signature}`;
}

export function verifySignedTicketQrToken(token: string, secret: string): TicketQrPayload | null {
  const parsed = parseTicketQrToken(token);

  if (!parsed) {
    return null;
  }

  const expectedSignature = createTicketQrSignature(parsed.signingInput, secret);
  const received = Buffer.from(parsed.signatureSegment, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (received.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(received, expected)) {
    return null;
  }

  return parsed.payload;
}
