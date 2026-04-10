-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM (
  'RESERVATION_CREATED',
  'RESERVATION_EXPIRED',
  'ORDER_COMPLETED',
  'PAYMENT_CAPTURED',
  'TICKET_ISSUED',
  'TICKET_TRANSFERRED',
  'TICKET_CHECKED_IN',
  'REFUND_PROCESSED',
  'EVENT_PUBLISHED',
  'EVENT_CANCELLED'
);

-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WebhookOutboxStatus" AS ENUM ('PENDING', 'DELIVERED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationProviderType" AS ENUM ('PAYMENT', 'MESSAGING', 'MAPS', 'STREAMING');

-- CreateEnum
CREATE TYPE "InboundProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscribedEventTypes" JSONB NOT NULL,
    "activeSigningKeyId" TEXT NOT NULL,
    "activeSigningSecret" TEXT NOT NULL,
    "previousSigningKeyId" TEXT,
    "previousSigningSecret" TEXT,
    "lastRotatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookOutboxEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" "WebhookEventType" NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "status" "WebhookOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "deadLetteredAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "httpStatus" INTEGER,
    "responseBody" TEXT,
    "responseTimeMs" INTEGER,
    "signatureKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundProviderEvent" (
    "id" TEXT NOT NULL,
    "providerType" "IntegrationProviderType" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "status" "InboundProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "orgId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_orgId_status_idx" ON "WebhookEndpoint"("orgId", "status");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_eventId_status_idx" ON "WebhookEndpoint"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookOutboxEvent_idempotencyKey_key" ON "WebhookOutboxEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WebhookOutboxEvent_status_nextAttemptAt_idx" ON "WebhookOutboxEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookOutboxEvent_orgId_eventType_createdAt_idx" ON "WebhookOutboxEvent"("orgId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookOutboxEvent_eventId_eventType_createdAt_idx" ON "WebhookOutboxEvent"("eventId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDeliveryAttempt_outboxEventId_attemptNumber_idx" ON "WebhookDeliveryAttempt"("outboxEventId", "attemptNumber");

-- CreateIndex
CREATE INDEX "WebhookDeliveryAttempt_endpointId_createdAt_idx" ON "WebhookDeliveryAttempt"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundProviderEvent_provider_providerEventId_key" ON "InboundProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "InboundProviderEvent_providerType_status_createdAt_idx" ON "InboundProviderEvent"("providerType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InboundProviderEvent_eventId_status_idx" ON "InboundProviderEvent"("eventId", "status");

-- CreateIndex
CREATE INDEX "InboundProviderEvent_orgId_status_idx" ON "InboundProviderEvent"("orgId", "status");

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookOutboxEvent" ADD CONSTRAINT "WebhookOutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookOutboxEvent" ADD CONSTRAINT "WebhookOutboxEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "WebhookOutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundProviderEvent" ADD CONSTRAINT "InboundProviderEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundProviderEvent" ADD CONSTRAINT "InboundProviderEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
