-- CreateEnum
CREATE TYPE "VenueMode" AS ENUM ('PHYSICAL', 'VIRTUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('OPEN', 'APPROVAL_REQUIRED', 'APPLICATION_BASED');

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "venueMode" "VenueMode" NOT NULL DEFAULT 'PHYSICAL',
ADD COLUMN "registrationType" "RegistrationType" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "venueName" TEXT,
ADD COLUMN "venueAddress" TEXT,
ADD COLUMN "virtualMeetingUrl" TEXT,
ADD COLUMN "totalCapacity" INTEGER,
ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GateStaffAssignment" (
    "id" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateStaffAssignment_gateId_userId_key" ON "GateStaffAssignment"("gateId", "userId");

-- CreateIndex
CREATE INDEX "GateStaffAssignment_eventId_gateId_idx" ON "GateStaffAssignment"("eventId", "gateId");

-- CreateIndex
CREATE INDEX "GateStaffAssignment_userId_eventId_idx" ON "GateStaffAssignment"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "GateStaffAssignment" ADD CONSTRAINT "GateStaffAssignment_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateStaffAssignment" ADD CONSTRAINT "GateStaffAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateStaffAssignment" ADD CONSTRAINT "GateStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
