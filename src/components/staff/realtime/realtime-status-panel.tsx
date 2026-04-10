"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RealtimeConnectionState } from "@/components/staff/realtime/use-checkin-realtime";
import type { CheckInMetricsSnapshot } from "@/components/staff/checkin/types";

type RealtimeStatusPanelProps = {
  connectionState: RealtimeConnectionState;
  connectionMessage: string;
  metrics: CheckInMetricsSnapshot | null;
};

function statusColorClass(connectionState: RealtimeConnectionState) {
  if (connectionState === "connected") {
    return "bg-emerald-500";
  }

  if (connectionState === "authenticating") {
    return "bg-amber-500";
  }

  if (connectionState === "disconnected") {
    return "bg-gray-500";
  }

  return "bg-rose-500";
}

export function RealtimeStatusPanel({
  connectionState,
  connectionMessage,
  metrics,
}: RealtimeStatusPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Realtime Status</CardTitle>
        <CardDescription>
          WebSocket connectivity and latest check-in metrics stream.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColorClass(connectionState)}`} />
          <span className="font-medium uppercase">{connectionState}</span>
        </div>

        <p className="text-sm text-gray-500">{connectionMessage}</p>

        {metrics ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Accepted</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.totals.accepted}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Rejected</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.totals.rejected}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Duplicate</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.totals.duplicate}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Realtime metrics will appear after the first stream update.</p>
        )}
      </CardContent>
    </Card>
  );
}
