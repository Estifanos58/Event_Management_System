-- CreateEnum
CREATE TYPE "PolicyDocumentType" AS ENUM (
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'MARKETING_COMMUNICATIONS'
);

-- CreateEnum
CREATE TYPE "DataDeletionRequestStatus" AS ENUM (
  'REQUESTED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED'
);

-- AlterTable
ALTER TABLE "DataExportJob"
ADD COLUMN "eventId" TEXT,
ADD COLUMN "requestedReason" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" "PolicyDocumentType" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL DEFAULT 'PERSONAL',
    "scopeId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DataDeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processorNote" TEXT,
    "metadata" JSONB,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataExportJob_eventId_status_idx" ON "DataExportJob"("eventId", "status");

-- CreateIndex
CREATE INDEX "DataExportJob_requestedBy_createdAt_idx" ON "DataExportJob"("requestedBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcceptance_userId_documentType_documentVersion_scopeType_scopeId_key" ON "PolicyAcceptance"("userId", "documentType", "documentVersion", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "PolicyAcceptance_userId_acceptedAt_idx" ON "PolicyAcceptance"("userId", "acceptedAt");

-- CreateIndex
CREATE INDEX "PolicyAcceptance_documentType_documentVersion_acceptedAt_idx" ON "PolicyAcceptance"("documentType", "documentVersion", "acceptedAt");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_status_requestedAt_idx" ON "DataDeletionRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_userId_requestedAt_idx" ON "DataDeletionRequest"("userId", "requestedAt");

-- AddForeignKey
ALTER TABLE "DataExportJob" ADD CONSTRAINT "DataExportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Immutable audit guard
CREATE OR REPLACE FUNCTION "prevent_audit_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_no_update"
BEFORE UPDATE ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_event_mutation"();

CREATE TRIGGER "AuditEvent_no_delete"
BEFORE DELETE ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_event_mutation"();
