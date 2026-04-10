-- CreateEnum
CREATE TYPE "TicketReleaseStrategy" AS ENUM ('STANDARD', 'EARLY_BIRD', 'PHASED', 'DYNAMIC');

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "slug" TEXT,
ADD COLUMN "brandingTheme" TEXT,
ADD COLUMN "brandingLogoUrl" TEXT,
ADD COLUMN "brandingPrimaryColor" TEXT,
ADD COLUMN "brandingAccentColor" TEXT,
ADD COLUMN "registrationFormConfig" JSONB,
ADD COLUMN "confirmationEmailTemplate" TEXT,
ADD COLUMN "reminderEmailTemplate" TEXT,
ADD COLUMN "reminderLeadHours" INTEGER,
ADD COLUMN "organizerAnnouncementTemplate" TEXT,
ADD COLUMN "shareMessage" TEXT,
ADD COLUMN "referralEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "referralDefaultCode" TEXT,
ADD COLUMN "campaignTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ticketSalesPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TicketClass"
ADD COLUMN "releaseStrategy" "TicketReleaseStrategy" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "unlockCode" TEXT,
ADD COLUMN "dynamicPricingConfig" JSONB,
ADD COLUMN "bulkPricingConfig" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
