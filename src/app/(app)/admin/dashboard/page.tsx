import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

export default async function AdminDashboardPage() {
  const [
    usersCount,
    organizationsCount,
    eventsCount,
    activeSessionsCount,
    recentAuditEvents,
    newestUsers,
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
  ]);

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
