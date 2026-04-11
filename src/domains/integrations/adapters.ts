import { verifyChapaPayloadSignature } from "@/core/chapa/signature";
import { IntegrationDomainError } from "@/domains/integrations/errors";
import type { IntegrationProviderType } from "@/domains/integrations/types";

type InboundSignatureVerificationInput = {
  signature: string | null;
  rawBody: string;
  payload: unknown;
};

type InboundProviderAdapter = {
  providerType: IntegrationProviderType;
  provider: string;
  verifySignature: (input: InboundSignatureVerificationInput) => boolean;
  extractProviderEventId: (payload: unknown) => string | null;
  extractEventType: (payload: unknown) => string | undefined;
};

function normalizeProvider(provider: string) {
  return provider.trim().toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCommonProviderEventId(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const directId = payload["id"];
  if (typeof directId === "string" && directId.trim()) {
    return directId.trim();
  }

  const directEventId = payload["eventId"];
  if (typeof directEventId === "string" && directEventId.trim()) {
    return directEventId.trim();
  }

  const data = payload["data"];
  if (isRecord(data)) {
    const dataId = data["id"];
    if (typeof dataId === "string" && dataId.trim()) {
      return dataId.trim();
    }

    const txRef = data["tx_ref"];
    if (typeof txRef === "string" && txRef.trim()) {
      return txRef.trim();
    }
  }

  return null;
}

function extractCommonEventType(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const event = payload["event"];
  if (typeof event === "string" && event.trim()) {
    return event.trim();
  }

  const type = payload["type"];
  if (typeof type === "string" && type.trim()) {
    return type.trim();
  }

  return undefined;
}

const chapaPaymentAdapter: InboundProviderAdapter = {
  providerType: "PAYMENT",
  provider: "CHAPA",
  verifySignature(input) {
    return verifyChapaPayloadSignature({
      rawBody: input.rawBody,
      signature: input.signature,
    });
  },
  extractProviderEventId(payload) {
    if (!isRecord(payload)) {
      return null;
    }

    const data = payload["data"];
    if (isRecord(data)) {
      const id = data["id"];
      if (typeof id === "string" && id.trim()) {
        return id.trim();
      }

      const txRef = data["tx_ref"];
      if (typeof txRef === "string" && txRef.trim()) {
        return txRef.trim();
      }
    }

    return extractCommonProviderEventId(payload);
  },
  extractEventType(payload) {
    return extractCommonEventType(payload);
  },
};

function createSharedSecretAdapter(
  providerType: IntegrationProviderType,
  provider: string,
  envSecretName: "MESSAGING_WEBHOOK_SECRET" | "MAPS_WEBHOOK_SECRET" | "STREAMING_WEBHOOK_SECRET",
): InboundProviderAdapter {
  return {
    providerType,
    provider,
    verifySignature(input) {
      const secret = process.env[envSecretName];
      if (!secret) {
        return false;
      }

      return Boolean(input.signature && input.signature === secret);
    },
    extractProviderEventId(payload) {
      return extractCommonProviderEventId(payload);
    },
    extractEventType(payload) {
      return extractCommonEventType(payload);
    },
  };
}

const messagingAdapter = createSharedSecretAdapter(
  "MESSAGING",
  "GENERIC_MESSAGING",
  "MESSAGING_WEBHOOK_SECRET",
);

const mapsAdapter = createSharedSecretAdapter(
  "MAPS",
  "GENERIC_MAPS",
  "MAPS_WEBHOOK_SECRET",
);

const streamingAdapter = createSharedSecretAdapter(
  "STREAMING",
  "GENERIC_STREAMING",
  "STREAMING_WEBHOOK_SECRET",
);

const adapters: InboundProviderAdapter[] = [
  chapaPaymentAdapter,
  messagingAdapter,
  mapsAdapter,
  streamingAdapter,
];

export function resolveInboundProviderAdapter(
  providerType: IntegrationProviderType,
  provider: string,
): InboundProviderAdapter {
  const normalized = normalizeProvider(provider);

  const adapter =
    adapters.find(
      (candidate) =>
        candidate.providerType === providerType &&
        normalizeProvider(candidate.provider) === normalized,
    ) ??
    adapters.find((candidate) => candidate.providerType === providerType);

  if (!adapter) {
    throw new IntegrationDomainError(
      422,
      "INTEGRATION_PROVIDER_NOT_SUPPORTED",
      `No adapter is registered for provider type ${providerType}.`,
    );
  }

  return adapter;
}
