export const TICKET_QR_PREFIX = "emsqr1";

export type TicketQrPayload = {
  version: 1;
  ticketId: string;
  buyerId: string;
  eventId: string;
  boughtAt: string;
};

export type ParsedTicketQrToken = {
  payload: TicketQrPayload;
  payloadSegment: string;
  signatureSegment: string;
  signingInput: string;
};

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toBase64UrlUtf8(value: string) {
  const encoded = new TextEncoder().encode(value);
  const base64 = bytesToBase64(encoded);

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlUtf8(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const bytes = base64ToBytes(padded);

  return new TextDecoder().decode(bytes);
}

function isValidPayload(payload: unknown): payload is TicketQrPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<TicketQrPayload>;

  return (
    candidate.version === 1
    && typeof candidate.ticketId === "string"
    && candidate.ticketId.trim().length > 0
    && typeof candidate.buyerId === "string"
    && candidate.buyerId.trim().length > 0
    && typeof candidate.eventId === "string"
    && candidate.eventId.trim().length > 0
    && typeof candidate.boughtAt === "string"
    && candidate.boughtAt.trim().length > 0
  );
}

export function encodeTicketQrPayload(payload: TicketQrPayload) {
  return toBase64UrlUtf8(JSON.stringify(payload));
}

export function decodeTicketQrPayload(token: string): TicketQrPayload | null {
  const parsed = parseTicketQrToken(token);

  return parsed?.payload ?? null;
}

export function parseTicketQrToken(token: string): ParsedTicketQrToken | null {
  const segments = token.trim().split(".");

  if (segments.length !== 3) {
    return null;
  }

  const [prefix, payloadSegment, signatureSegment] = segments;

  if (prefix !== TICKET_QR_PREFIX || !payloadSegment || !signatureSegment) {
    return null;
  }

  try {
    const payloadJson = fromBase64UrlUtf8(payloadSegment);
    const parsedPayload = JSON.parse(payloadJson) as unknown;

    if (!isValidPayload(parsedPayload)) {
      return null;
    }

    return {
      payload: parsedPayload,
      payloadSegment,
      signatureSegment,
      signingInput: `${TICKET_QR_PREFIX}.${payloadSegment}`,
    };
  } catch {
    return null;
  }
}

export function buildTicketQrToken(payload: TicketQrPayload, signatureSegment: string) {
  const payloadSegment = encodeTicketQrPayload(payload);

  return `${TICKET_QR_PREFIX}.${payloadSegment}.${signatureSegment}`;
}
