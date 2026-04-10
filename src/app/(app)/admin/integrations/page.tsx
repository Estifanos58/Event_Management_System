import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

export default async function AdminIntegrationsPage() {
  const [byProviderType, byStatus, latestInbound] = await Promise.all([
    prisma.inboundProviderEvent.groupBy({
      by: ["providerType"],
      _count: {
        _all: true,
      },
    }),
    prisma.inboundProviderEvent.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.inboundProviderEvent.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        providerType: true,
        provider: true,
        providerEventId: true,
        eventType: true,
        status: true,
        errorMessage: true,
        processedAt: true,
        createdAt: true,
        organization: {
          select: {
            displayName: true,
          },
        },
        event: {
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Inbound Health</CardTitle>
          <CardDescription>
            Provider event ingestion state, processing reliability, and failure visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {byProviderType.map((entry) => (
            <div key={entry.providerType} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">{entry.providerType}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{entry._count._all}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processing Status Distribution</CardTitle>
          <CardDescription>Inbound provider events grouped by current processing state.</CardDescription>
        </CardHeader>
        <CardContent>
          {byStatus.length === 0 ? (
            <p className="text-sm text-gray-500">No inbound events found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {byStatus.map((status) => (
                <article key={status.status} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs uppercase tracking-widest text-gray-500">{status.status}</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{status._count._all}</p>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Provider Events</CardTitle>
          <CardDescription>Most recent inbound events with mapping and failure context.</CardDescription>
        </CardHeader>
        <CardContent>
          {latestInbound.length === 0 ? (
            <p className="text-sm text-gray-500">No inbound events recorded.</p>
          ) : (
            <div className="max-h-155 space-y-2 overflow-y-auto pr-1">
              {latestInbound.map((inbound) => (
                <article key={inbound.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {inbound.providerType} · {inbound.provider}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {inbound.status} · {inbound.eventType ?? "unknown_event"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Org: {inbound.organization?.displayName ?? "unmapped"} · Event:{" "}
                    {inbound.event?.title ?? "unmapped"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Provider Event ID: {inbound.providerEventId}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Processed: {inbound.processedAt ? inbound.processedAt.toLocaleString() : "pending"}
                  </p>
                  {inbound.errorMessage ? (
                    <p className="mt-1 text-xs text-gray-500">Error: {inbound.errorMessage}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
