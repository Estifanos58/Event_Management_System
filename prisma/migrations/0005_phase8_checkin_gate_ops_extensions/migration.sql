-- AlterTable
ALTER TABLE "CheckInEvent"
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "clientScanId" TEXT;

-- CreateTable
CREATE TABLE "GateTicketClassAccess" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "ticketClassId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateTicketClassAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateTicketClassAccess_gateId_ticketClassId_key" ON "GateTicketClassAccess"("gateId", "ticketClassId");

-- CreateIndex
CREATE INDEX "GateTicketClassAccess_eventId_gateId_idx" ON "GateTicketClassAccess"("eventId", "gateId");

-- CreateIndex
CREATE INDEX "GateTicketClassAccess_eventId_ticketClassId_idx" ON "GateTicketClassAccess"("eventId", "ticketClassId");

-- CreateIndex
CREATE INDEX "CheckInEvent_gateId_scannedAt_idx" ON "CheckInEvent"("gateId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInEvent_eventId_clientScanId_key" ON "CheckInEvent"("eventId", "clientScanId");

-- AddForeignKey
ALTER TABLE "GateTicketClassAccess" ADD CONSTRAINT "GateTicketClassAccess_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateTicketClassAccess" ADD CONSTRAINT "GateTicketClassAccess_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateTicketClassAccess" ADD CONSTRAINT "GateTicketClassAccess_ticketClassId_fkey" FOREIGN KEY ("ticketClassId") REFERENCES "TicketClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
