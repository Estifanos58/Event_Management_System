export const integrationsDomain = {
  name: "integrations",
  description:
    "Owns outbound webhooks, inbound callback verification, retry, and replay contracts.",
};

export {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  listSupportedWebhookEventTopics,
  publishWebhookEvent,
  listWebhookOutboxEvents,
  listWebhookDeadLetters,
  replayWebhookEvents,
  runIntegrationsMaintenance,
  ingestInboundProviderCallback,
  markInboundProviderEventProcessed,
  markInboundProviderEventFailed,
  listInboundProviderEvents,
} from "@/domains/integrations/service";
export {
  IntegrationDomainError,
  toIntegrationErrorResponse,
  type IntegrationDomainErrorCode,
} from "@/domains/integrations/errors";
export type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookEndpointListItem,
  PublishWebhookEventInput,
  ListWebhookOutboxEventsQuery,
  WebhookOutboxListItem,
  ReplayWebhookEventsInput,
  IngestInboundProviderCallbackInput,
  IngestInboundProviderCallbackResult,
  IntegrationsMaintenanceResult,
  InboundProviderEventListQuery,
  InboundProviderEventListItem,
} from "@/domains/integrations/types";
