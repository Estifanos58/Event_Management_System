import assert from "node:assert/strict";
import test from "node:test";
import { decodeTicketQrPayload } from "@/domains/checkin/qr-payload";
import {
  createSignedTicketQrToken,
  verifySignedTicketQrToken,
} from "@/domains/checkin/qr-signing";

const SECRET = "test-secret-value-for-qr-signing";

function buildPayload() {
  return {
    version: 1 as const,
    ticketId: "ticket_123",
    buyerId: "buyer_456",
    eventId: "event_789",
    boughtAt: "2026-04-10T12:00:00.000Z",
  };
}

test("signed QR token round-trips with verified payload", () => {
  const token = createSignedTicketQrToken(buildPayload(), SECRET);

  const decoded = decodeTicketQrPayload(token);
  const verified = verifySignedTicketQrToken(token, SECRET);

  assert.ok(decoded);
  assert.ok(verified);
  assert.equal(verified?.ticketId, "ticket_123");
  assert.equal(verified?.buyerId, "buyer_456");
  assert.equal(verified?.eventId, "event_789");
});

test("signed QR token verification fails for tampered payload", () => {
  const token = createSignedTicketQrToken(buildPayload(), SECRET);
  const segments = token.split(".");

  assert.equal(segments.length, 3);

  const tamperedPayload = {
    ...buildPayload(),
    buyerId: "buyer_tampered",
  };
  const tamperedPayloadSegment = Buffer.from(
    JSON.stringify(tamperedPayload),
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const tamperedToken = `${segments[0]}.${tamperedPayloadSegment}.${segments[2]}`;

  const verified = verifySignedTicketQrToken(tamperedToken, SECRET);
  assert.equal(verified, null);
});
