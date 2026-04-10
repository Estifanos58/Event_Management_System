"use client";

import { RealtimeEventFeed } from "@/components/staff/realtime/realtime-event-feed";
import { RealtimeStatusPanel } from "@/components/staff/realtime/realtime-status-panel";
import { useCheckInRealtime } from "@/components/staff/realtime/use-checkin-realtime";

type CheckInRealtimeConsoleProps = {
  eventId: string;
};

export function CheckInRealtimeConsole({ eventId }: CheckInRealtimeConsoleProps) {
  const realtime = useCheckInRealtime(eventId);

  return (
    <div className="space-y-4">
      <RealtimeStatusPanel
        connectionState={realtime.connectionState}
        connectionMessage={realtime.connectionMessage}
        metrics={realtime.metrics}
      />
      <RealtimeEventFeed feed={realtime.feed} />
    </div>
  );
}
