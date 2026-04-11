ALTER TABLE "Refund"
ADD COLUMN "providerRefundReference" TEXT,
ADD COLUMN "providerStatus" TEXT,
ADD COLUMN "providerResponse" JSONB,
ADD COLUMN "failureCode" TEXT;

CREATE INDEX "Refund_providerRefundReference_idx" ON "Refund"("providerRefundReference");
