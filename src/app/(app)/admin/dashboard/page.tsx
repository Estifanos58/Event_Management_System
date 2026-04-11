import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminDashboardCharts } from "@/components/admin/charts/admin-dashboard-charts";
import { prisma } from "@/core/db/prisma";

const TREND_DAYS = 30;

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function AdminDashboardPage() {
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));
  trendStart.setHours(0, 0, 0, 0);

  const [
    usersCount,
    organizationsCount,
    eventsCount,
    activeSessionsCount,
    recentAuditEvents,
    newestUsers,
    usersInTrend,
    eventsInTrend,
    sessionsInTrend,
    eventStatusRows,
    auditActionsInTrend,
    verificationRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.event.count(),
    prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    }),
    prisma.auditEvent.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      select: {
        id: true,
        action: true,
        scopeType: true,
        scopeId: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
      },
    }),
    prisma.user.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.event.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.session.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.event.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.auditEvent.findMany({
      where: {
        createdAt: {
          gte: trendStart,
        },
      },
      select: {
        action: true,
      },
    }),
    prisma.user.groupBy({
      by: ["emailVerified"],
      _count: {
        _all: true,
      },
    }),
  ]);

  const growthSeed = new Map<
    string,
    {
      day: string;
      users: number;
      events: number;
      sessions: number;
    }
  >();

  for (let index = 0; index < TREND_DAYS; index += 1) {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);

    growthSeed.set(toDayKey(date), {
      day: toDayLabel(date),
      users: 0,
      events: 0,
      sessions: 0,
    });
  }

  for (const user of usersInTrend) {
    const bucket = growthSeed.get(toDayKey(user.createdAt));
    if (bucket) {
      bucket.users += 1;
    }
  }

  for (const event of eventsInTrend) {
    const bucket = growthSeed.get(toDayKey(event.createdAt));
    if (bucket) {
      bucket.events += 1;
    }
  }

  for (const session of sessionsInTrend) {
    const bucket = growthSeed.get(toDayKey(session.createdAt));
    if (bucket) {
      bucket.sessions += 1;
    }
  }

  const eventStatusBreakdown = eventStatusRows.map((row) => ({
    label: row.status,
    value: row._count._all,
  }));

  const auditActionCount = new Map<string, number>();
  for (const audit of auditActionsInTrend) {
    auditActionCount.set(audit.action, (auditActionCount.get(audit.action) ?? 0) + 1);
  }

  const auditActionBreakdown = Array.from(auditActionCount.entries())
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);

  const verifiedUsers =
    verificationRows.find((row) => row.emailVerified)?._count._all ?? 0;
  const unverifiedUsers =
    verificationRows.find((row) => !row.emailVerified)?._count._all ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Platform Overview</h1>
        <p className="mt-2 text-sm text-gray-500">
          Monitor system health, governance events, and account growth from one admin workspace.
        </p>
      </header>

      <main className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-linear-to-br from-orange-50 to-red-50">
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">Users</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{usersCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Organizations</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{organizationsCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Events</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{eventsCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Active Sessions</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">{activeSessionsCount}</p>
            </CardContent>
          </Card>
        </section>

        <AdminDashboardCharts
          growthTrend={Array.from(growthSeed.values())}
          eventStatusBreakdown={eventStatusBreakdown}
          auditActionBreakdown={auditActionBreakdown}
          emailVerification={{
            verified: verifiedUsers,
            unverified: unverifiedUsers,
          }}
        />

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Audit Activity</CardTitle>
              <CardDescription>Latest audited actions across scope boundaries.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAuditEvents.length === 0 ? (
                <p className="text-sm text-gray-500">No audit events recorded.</p>
              ) : (
                <div className="space-y-3">
                  {recentAuditEvents.map((event) => (
                    <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm font-semibold text-gray-900">{event.action}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {event.scopeType}:{event.scopeId} → {event.targetType}:{event.targetId}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {event.actor?.name || event.actor?.email || "System"} ·{" "}
                        {event.createdAt.toLocaleString()}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Newest Accounts</CardTitle>
              <CardDescription>Freshly onboarded users and verification posture.</CardDescription>
            </CardHeader>
            <CardContent>
              {newestUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No users found.</p>
              ) : (
                <div className="space-y-3">
                  {newestUsers.map((user) => (
                    <article key={user.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{user.email}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {user.emailVerified ? "Verified" : "Unverified"} · {user.createdAt.toLocaleString()}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
