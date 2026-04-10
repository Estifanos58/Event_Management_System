"use client";

import { Button } from "@/components/ui/button";
import type { OfflineQueuedScan, SyncOfflineCheckInResult } from "@/components/staff/checkin/types";

type OfflineSyncPanelProps = {
  queue: OfflineQueuedScan[];
  syncing: boolean;
  lastSyncResult: SyncOfflineCheckInResult | null;
  onSync: () => Promise<void> | void;
  onClear: () => void;
};

export function OfflineSyncPanel({
  queue,
  syncing,
  lastSyncResult,
  onSync,
  onClear,
}: OfflineSyncPanelProps) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">Offline Queue</p>
          <p className="mt-1 text-xs text-gray-500">
            Buffered scans captured while offline or under network degradation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClear}
            disabled={queue.length === 0 || syncing}
          >
            Clear
          </Button>
          <Button size="sm" onClick={onSync} disabled={queue.length === 0 || syncing}>
            {syncing ? "Syncing..." : "Sync now"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">Queued scans: {queue.length}</p>

      {lastSyncResult ? (
        <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-500">
          <p>
            Processed {lastSyncResult.processed} | Accepted {lastSyncResult.accepted} |
            Rejected {lastSyncResult.rejected} | Duplicate {lastSyncResult.duplicate} |
            Failed {lastSyncResult.failed}
          </p>
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {queue.slice(0, 30).map((item) => (
            <article
              key={item.clientScanId}
              className="rounded-lg border border-gray-200 p-3 text-xs text-gray-500"
            >
              <p className="font-medium text-gray-900">{item.manualOverride ? "Manual override" : "Scanner flow"}</p>
              <p className="mt-1">Gate: {item.gateId}</p>
              <p className="mt-1">Scanned: {new Date(item.scannedAt).toLocaleString()}</p>
              <p className="mt-1">Client id: {item.clientScanId}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No queued scans.</p>
      )}
    </section>
  );
}
