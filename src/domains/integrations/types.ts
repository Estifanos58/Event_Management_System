import {
  InboundProviderEventStatus,
  WebhookEndpointStatus,
  WebhookEventType,
  WebhookOutboxStatus,
} from "@prisma/client";

export const INTEGRATION_PROVIDER_TYPES = [
  "PAYMENT",
  "MESSAGING",
  "MAPS",
  "STREAMING",
] as const;

export type IntegrationProviderType = (typeof INTEGRATION_PROVIDER_TYPES)[number];

export type CreateWebhookEndpointInput = {
  name?: unknown;
  url?: unknown;
  eventTypes?: unknown;
  signingKeyId?: unknown;
  signingSecret?: unknown;
  status?: unknown;
};

export type UpdateWebhookEndpointInput = {
  name?: unknown;
  url?: unknown;
  eventTypes?: unknown;
  status?: unknown;
  rotateSigningKey?: unknown;
  newSigningKeyId?: unknown;
  newSigningSecret?: unknown;
};

export type WebhookEndpointListItem = {
  id: string;
  name: string;
  url: string;
  status: WebhookEndpointStatus;
  eventTypes: string[];
  activeSigningKeyId: string;
  previousSigningKeyId?: string;
  lastRotatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublishWebhookEventInput = {
  eventType?: unknown;
  payload?: unknown;
  metadata?: unknown;
  idempotencyKey?: unknown;
  maxAttempts?: unknown;
};

export type ListWebhookOutboxEventsQuery = {
  status?: unknown;
  eventType?: unknown;
  take?: unknown;
};

export type WebhookOutboxListItem = {
  id: string;
  eventType: string;
  eventTypeEnum: WebhookEventType;
  status: WebhookOutboxStatus;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  deadLetteredAt?: string;
  deliveredAt?: string;
  createdAt: string;
  lastError?: string;
};

export type ReplayWebhookEventsInput = {
  from?: unknown;
  to?: unknown;
  eventTypes?: unknown;
  maxEvents?: unknown;
};

export type IngestInboundProviderCallbackInput = {
  providerType?: unknown;
  provider?: unknown;
  signature?: unknown;
  rawBody?: unknown;
  payload: unknown;
  providerEventId?: unknown;
  eventType?: unknown;
  orgId?: unknown;
  eventId?: unknown;
};

export type IngestInboundProviderCallbackResult = {
  idempotent: boolean;
  shouldProcess: boolean;
  inboundEventId: string;
  providerEventId: string;
  provider: string;
  providerType: IntegrationProviderType;
};

export type IntegrationsMaintenanceResult = {
  processed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  purged: number;
};

export type InboundProviderEventListQuery = {
  providerType?: unknown;
  status?: unknown;
  take?: unknown;
};

export type InboundProviderEventListItem = {
  id: string;
  providerType: IntegrationProviderType;
  provider: string;
  providerEventId: string;
  eventType?: string;
  status: InboundProviderEventStatus;
  createdAt: string;
  processedAt?: string;
  errorMessage?: string;
};
