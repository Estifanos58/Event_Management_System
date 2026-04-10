"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IncidentLogForm } from "@/components/staff/checkin/incident-log-form";
import { ManualCheckInForm } from "@/components/staff/checkin/manual-checkin-form";
import { OfflineSyncPanel } from "@/components/staff/checkin/offline-sync-panel";
import { ScanTicketForm } from "@/components/staff/checkin/scan-ticket-form";
import type {
  CheckInMetricsSnapshot,
  CheckInResultRecord,
  OfflineQueuedScan,
  StaffGateOption,
  SyncOfflineCheckInResult,
} from "@/components/staff/checkin/types";

type StaffCheckInOpsConsoleProps = {
  eventId: string;
  eventTitle: string;
  gates: StaffGateOption[];
};

type ApiErrorPayload = {
  error?: string;
};

type ScanResponse = {
  result: CheckInResultRecord;
};

type MetricsResponse = {
  metrics: CheckInMetricsSnapshot;
};

type SyncResponse = {
  result: SyncOfflineCheckInResult;
};

function queueStorageKey(eventId: string) {
  return `staff-offline-checkin:${eventId}`;
}

function getDeviceId() {
  if (typeof window === "undefined") {
    return "staff-web";
  }

  const storageKey = "staff-checkin-device-id";
  const existing = window.localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const created =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}`;

  window.localStorage.setItem(storageKey, created);
  return created;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload as T;
}

function statusBadgeClass(status: string) {
  if (status === "ACCEPTED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "REJECTED") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "DUPLICATE") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-gray-100 text-gray-600";
}

export function StaffCheckInOpsConsole({
  eventId,
  eventTitle,
  gates,
}: StaffCheckInOpsConsoleProps) {
  const [deviceId] = useState(getDeviceId);
  const [recentResults, setRecentResults] = useState<CheckInResultRecord[]>([]);
  const [lastSyncResult, setLastSyncResult] = useState<SyncOfflineCheckInResult | null>(null);
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  });
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedScan[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const raw = window.localStorage.getItem(queueStorageKey(eventId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as OfflineQueuedScan[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(queueStorageKey(eventId), JSON.stringify(offlineQueue));
  }, [eventId, offlineQueue]);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const metricsQuery = useQuery({
    queryKey: ["staff-checkin-metrics", eventId],
    queryFn: async () => {
      const payload = await requestJson<MetricsResponse>(
        `/api/events/${eventId}/checkin/metrics`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      return payload.metrics;
    },
    refetchInterval: 15_000,
  });

  const statusCards = useMemo(() => {
    const totals = metricsQuery.data?.totals;

    return {
      accepted: totals?.accepted ?? 0,
      rejected: totals?.rejected ?? 0,
      duplicate: totals?.duplicate ?? 0,
    };
  }, [metricsQuery.data?.totals]);

  function enqueueScan(scan: OfflineQueuedScan) {
    setOfflineQueue((previous) => {
      if (previous.some((item) => item.clientScanId === scan.clientScanId)) {
        return previous;
      }

      return [scan, ...previous].slice(0, 500);
    });
  }

  const scanMutation = useMutation({
    mutationFn: async (input: {
      qrToken: string;
      gateId: string;
      ticketId?: string;
      buyerId?: string;
      eventId?: string;
      boughtAt?: string;
    }) => {
      const payload: OfflineQueuedScan = {
        clientScanId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `scan-${Date.now()}`,
        gateId: input.gateId,
        qrToken: input.qrToken,
        ticketId: input.ticketId,
        buyerId: input.buyerId,
        eventId: input.eventId,
        boughtAt: input.boughtAt,
        scannedAt: new Date().toISOString(),
        deviceId,
        manualOverride: false,
      };

      if (!isOnline) {
        enqueueScan(payload);
        return { queued: true as const };
      }

      try {
        const response = await requestJson<ScanResponse>(`/api/events/${eventId}/checkin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            qrToken: input.qrToken,
            gateId: input.gateId,
            ticketId: input.ticketId,
            buyerId: input.buyerId,
            eventId: input.eventId,
            boughtAt: input.boughtAt,
            clientScanId: payload.clientScanId,
            deviceId,
          }),
        });

        return {
          queued: false as const,
          result: response.result,
        };
      } catch (error) {
        if (!navigator.onLine || error instanceof TypeError) {
          enqueueScan(payload);
          return { queued: true as const };
        }

        throw error;
      }
    },
    onSuccess: (result) => {
      if (result.queued) {
        toast.info("Scan queued for offline sync.");
        return;
      }

      if (
        result.result.status === "DUPLICATE"
        && result.result.reason === "verification_in_progress"
      ) {
        toast.info("This QR is currently being verified by another scanner.");
      } else {
        toast.success(`Scan ${result.result.status.toLowerCase()}.`);
      }

      setRecentResults((previous) => [result.result, ...previous].slice(0, 20));
      void metricsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Scan failed.");
    },
  });

  const manualMutation = useMutation({
    mutationFn: async (input: {
      gateId: string;
      reason: string;
      ticketId?: string;
      qrToken?: string;
    }) => {
      const payload: OfflineQueuedScan = {
        clientScanId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `manual-${Date.now()}`,
        gateId: input.gateId,
        ticketId: input.ticketId,
        qrToken: input.qrToken,
        reason: input.reason,
        scannedAt: new Date().toISOString(),
        deviceId,
        manualOverride: true,
      };

      if (!isOnline) {
        enqueueScan(payload);
        return { queued: true as const };
      }

      try {
        const response = await requestJson<ScanResponse>(
          `/api/events/${eventId}/checkin/manual`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ticketId: input.ticketId,
              qrToken: input.qrToken,
              gateId: input.gateId,
              reason: input.reason,
              clientScanId: payload.clientScanId,
              deviceId,
            }),
          },
        );

        return {
          queued: false as const,
          result: response.result,
        };
      } catch (error) {
        if (!navigator.onLine || error instanceof TypeError) {
          enqueueScan(payload);
          return { queued: true as const };
        }

        throw error;
      }
    },
    onSuccess: (result) => {
      if (result.queued) {
        toast.info("Manual override queued for offline sync.");
        return;
      }

      setRecentResults((previous) => [result.result, ...previous].slice(0, 20));
      void metricsQuery.refetch();
      toast.success(`Manual check-in ${result.result.status.toLowerCase()}.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Manual check-in failed.");
    },
  });

  const incidentMutation = useMutation({
    mutationFn: async (input: {
      gateId: string;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      message: string;
      occurredAt?: string;
    }) => {
      await requestJson<{ incident: { id: string } }>(
        `/api/events/${eventId}/checkin/incidents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gateId: input.gateId,
            severity: input.severity,
            message: input.message,
            occurredAt: input.occurredAt,
          }),
        },
      );
    },
    onSuccess: () => {
      toast.success("Incident logged.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Incident logging failed.");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const payload = await requestJson<SyncResponse>(`/api/events/${eventId}/checkin/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scans: offlineQueue.map((scan) => ({
            gateId: scan.gateId,
            scannedAt: scan.scannedAt,
            clientScanId: scan.clientScanId,
            deviceId: scan.deviceId,
            mode: "OFFLINE",
            ticketId: scan.ticketId,
            qrToken: scan.qrToken,
            buyerId: scan.buyerId,
            eventId: scan.eventId,
            boughtAt: scan.boughtAt,
            manualOverride: scan.manualOverride,
            reason: scan.reason,
          })),
        }),
      });

      return payload.result;
    },
    onSuccess: (result) => {
      setLastSyncResult(result);

      const failedIds = new Set(
        result.results
          .filter((item) => item.status === "ERROR")
          .map((item) => item.clientScanId),
      );

      setOfflineQueue((previous) =>
        previous.filter((scan) => failedIds.has(scan.clientScanId)),
      );

      const successResults = result.results
        .map((item) => item.result)
        .filter((item): item is CheckInResultRecord => Boolean(item));

      if (successResults.length > 0) {
        setRecentResults((previous) => [...successResults, ...previous].slice(0, 20));
      }

      void metricsQuery.refetch();
      toast.success(`Offline sync processed ${result.processed} scans.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Offline sync failed.");
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Check-In Command Center</CardTitle>
          <CardDescription>
            Event-day operations for {eventTitle}. Capture scans, perform manual overrides, and sync
            offline queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Accepted</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{statusCards.accepted}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Rejected</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{statusCards.rejected}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Duplicate</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{statusCards.duplicate}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ScanTicketForm
          gates={gates}
          disabled={scanMutation.isPending}
          onSubmit={async (input) => {
            await scanMutation.mutateAsync(input);
          }}
        />

        <ManualCheckInForm
          gates={gates}
          disabled={manualMutation.isPending}
          onSubmit={async (input) => {
            await manualMutation.mutateAsync(input);
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <IncidentLogForm
          gates={gates}
          disabled={incidentMutation.isPending}
          onSubmit={async (input) => {
            await incidentMutation.mutateAsync(input);
          }}
        />

        <OfflineSyncPanel
          queue={offlineQueue}
          syncing={syncMutation.isPending}
          lastSyncResult={lastSyncResult}
          onSync={async () => {
            if (offlineQueue.length === 0) {
              toast.info("No queued scans to sync.");
              return;
            }

            await syncMutation.mutateAsync();
          }}
          onClear={() => {
            setOfflineQueue([]);
            toast.info("Offline queue cleared.");
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Check-In Results</CardTitle>
          <CardDescription>
            Latest processed check-in outcomes from scanner, manual, and sync operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentResults.length === 0 ? (
            <p className="text-sm text-gray-500">No recent check-in operations yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentResults.map((result) => (
                <article
                  key={result.checkInEventId}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(result.status)}`}
                    >
                      {result.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(result.scannedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                    <p>
                      Gate: <span className="font-medium text-gray-900">{result.gateId}</span>
                    </p>
                    <p>
                      Mode: <span className="font-medium text-gray-900">{result.mode}</span>
                    </p>
                    <p className="sm:col-span-2">
                      Ticket: <span className="font-medium text-gray-900">{result.ticketId}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!isOnline ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You are offline. New scans will be queued and synced when connection resumes.
        </p>
      ) : null}
    </div>
  );
}
