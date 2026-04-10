-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "buyerSnapshot" JSONB,
ADD COLUMN "attendeeSnapshot" JSONB,
ADD COLUMN "customFieldResponses" JSONB,
ADD COLUMN "promoCode" TEXT,
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "invoiceRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "invoiceReference" TEXT,
ADD COLUMN "checkoutSessionFingerprint" TEXT;

-- AlterTable
ALTER TABLE "PaymentAttempt"
ADD COLUMN "providerEventId" TEXT,
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "callbackPayload" JSONB;

-- AlterTable
ALTER TABLE "Ticket"
ADD COLUMN "deliveryChannels" JSONB,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT;

-- AlterTable
ALTER TABLE "TicketTransfer"
ADD COLUMN "respondedAt" TIMESTAMP(3),
ADD COLUMN "responseReason" TEXT;

-- CreateIndex
CREATE INDEX "Order_checkoutSessionFingerprint_idx" ON "Order"("checkoutSessionFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_provider_providerEventId_key" ON "PaymentAttempt"("provider", "providerEventId");
