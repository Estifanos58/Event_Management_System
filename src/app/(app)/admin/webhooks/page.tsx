import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type EndpointRow = {
  id: string;
  name: string;
  url: string;
  status: string;
  lastRotatedAt: Date | null;
  createdAt: Date;
  organization: {
    displayName: string;
  };
  event: {
    title: string;
  } | null;
  _count: {
    deliveries: number;
  };
};

type DeadLetterRow = {
  id: string;
  eventType: string;
  attemptCount: number;
  lastError: string | null;
  updatedAt: Date;
  organization: {
    displayName: string;
  };
};

export default async function AdminWebhooksPage() {
  const [endpoints, outboxByStatus, deliveryStats, deadLetters] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      take: 120,
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        lastRotatedAt: true,
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
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    }) as Promise<EndpointRow[]>,
    prisma.webhookOutboxEvent.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.webhookDeliveryAttempt.aggregate({
      _count: {
        _all: true,
      },
      _avg: {
        responseTimeMs: true,
      },
    }),
    prisma.webhookOutboxEvent.findMany({
      where: {
        status: "DEAD_LETTER",
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 80,
      select: {
        id: true,
        eventType: true,
        attemptCount: true,
        lastError: true,
        updatedAt: true,
        organization: {
          select: {
            displayName: true,
          },
        },
      },
    }) as Promise<DeadLetterRow[]>,
  ]);

  const outboxMap = new Map(outboxByStatus.map((row) => [row.status, row._count._all]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Operations</CardTitle>
          <CardDescription>
            Endpoint lifecycle, delivery behavior, and dead-letter queue visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Endpoints</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{endpoints.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Pending outbox</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("PENDING") ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Delivered outbox</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("DELIVERED") ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Dead letters</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{outboxMap.get("DEAD_LETTER") ?? 0}</p>
            <p className="mt-1 text-xs text-gray-500">
              Avg response: {Math.round(deliveryStats._avg.responseTimeMs ?? 0)} ms
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Endpoint Inventory</CardTitle>
            <CardDescription>Latest webhook endpoints across organizations and events.</CardDescription>
          </CardHeader>
          <CardContent>
            {endpoints.length === 0 ? (
              <p className="text-sm text-gray-500">No webhook endpoints configured.</p>
            ) : (
              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {endpoints.map((endpoint) => (
                  <article
                    key={endpoint.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{endpoint.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{endpoint.status} · {endpoint.url}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {endpoint.organization.displayName} · Event: {endpoint.event?.title ?? "all"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Deliveries: {endpoint._count.deliveries} · Rotated:{" "}
                      {endpoint.lastRotatedAt ? endpoint.lastRotatedAt.toLocaleString() : "never"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dead-letter Queue</CardTitle>
            <CardDescription>Failed outbox events requiring replay or remediation.</CardDescription>
          </CardHeader>
          <CardContent>
            {deadLetters.length === 0 ? (
              <p className="text-sm text-gray-500">No dead-letter events found.</p>
            ) : (
              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {deadLetters.map((deadLetter) => (
                  <article
                    key={deadLetter.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{deadLetter.eventType}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {deadLetter.organization.displayName} · Attempts: {deadLetter.attemptCount}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{deadLetter.lastError ?? "No error payload"}</p>
                    <p className="mt-1 text-xs text-gray-500">Updated: {deadLetter.updatedAt.toLocaleString()}</p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
