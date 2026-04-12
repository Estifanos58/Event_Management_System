ALTER TYPE "AbuseTargetType" ADD VALUE IF NOT EXISTS 'USER';

CREATE TYPE "ModerationBanScope" AS ENUM ('GLOBAL_USER', 'GLOBAL_ORGANIZATION', 'ORGANIZATION_USER');
CREATE TYPE "ModerationBanStatus" AS ENUM ('ACTIVE', 'LIFTED');
CREATE TYPE "ModerationAppealStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

CREATE TABLE "ModerationBan" (
    "id" TEXT NOT NULL,
    "scope" "ModerationBanScope" NOT NULL,
    "status" "ModerationBanStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "subjectOrganizationId" TEXT,
    "scopeOrganizationId" TEXT,
    "sourceReportId" TEXT,
    "sourceRiskCaseId" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "liftedBy" TEXT,
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationBan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "banId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "ModerationAppealStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "reviewerNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationBan_scope_status_createdAt_idx" ON "ModerationBan"("scope", "status", "createdAt");
CREATE INDEX "ModerationBan_subjectUserId_status_idx" ON "ModerationBan"("subjectUserId", "status");
CREATE INDEX "ModerationBan_subjectOrganizationId_status_idx" ON "ModerationBan"("subjectOrganizationId", "status");
CREATE INDEX "ModerationBan_scopeOrganizationId_status_idx" ON "ModerationBan"("scopeOrganizationId", "status");

CREATE INDEX "ModerationAppeal_banId_status_createdAt_idx" ON "ModerationAppeal"("banId", "status", "createdAt");
CREATE INDEX "ModerationAppeal_requesterId_status_createdAt_idx" ON "ModerationAppeal"("requesterId", "status", "createdAt");

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_subjectUserId_fkey"
FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_subjectOrganizationId_fkey"
FOREIGN KEY ("subjectOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_scopeOrganizationId_fkey"
FOREIGN KEY ("scopeOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_sourceReportId_fkey"
FOREIGN KEY ("sourceReportId") REFERENCES "AbuseReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_sourceRiskCaseId_fkey"
FOREIGN KEY ("sourceRiskCaseId") REFERENCES "RiskCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ModerationBan"
ADD CONSTRAINT "ModerationBan_liftedBy_fkey"
FOREIGN KEY ("liftedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationAppeal"
ADD CONSTRAINT "ModerationAppeal_banId_fkey"
FOREIGN KEY ("banId") REFERENCES "ModerationBan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModerationAppeal"
ADD CONSTRAINT "ModerationAppeal_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModerationAppeal"
ADD CONSTRAINT "ModerationAppeal_reviewedBy_fkey"
FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
