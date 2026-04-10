import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/core/db/prisma";

type AdminUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      roleBindings: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          role: true,
          scopeType: true,
          scopeId: true,
          createdAt: true,
        },
      },
      sessions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
          activeContextType: true,
          activeContextId: true,
        },
      },
      auditEvents: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
        select: {
          id: true,
          action: true,
          scopeType: true,
          scopeId: true,
          targetType: true,
          targetId: true,
          createdAt: true,
          reason: true,
        },
      },
    },
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Not Found</CardTitle>
          <CardDescription>
            No user exists for the requested identifier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/users"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            Back to users
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>
            Identity profile and verification metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Name</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{user.name}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Email</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{user.email}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Verification</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {user.emailVerified ? "VERIFIED" : "UNVERIFIED"}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">Created</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{user.createdAt.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Role Bindings</CardTitle>
            <CardDescription>
              Current role scope bindings for authorization tracing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.roleBindings.length === 0 ? (
              <p className="text-sm text-gray-500">No role bindings found.</p>
            ) : (
              <div className="space-y-2">
                {user.roleBindings.map((binding) => (
                  <article
                    key={binding.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{binding.role}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {binding.scopeType}:{binding.scopeId}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{binding.createdAt.toLocaleString()}</p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>
              Latest session contexts and expiration windows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.sessions.length === 0 ? (
              <p className="text-sm text-gray-500">No sessions found.</p>
            ) : (
              <div className="space-y-2">
                {user.sessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-xs text-gray-500">Created: {session.createdAt.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-gray-500">Expires: {session.expiresAt.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Context: {session.activeContextType ?? "-"}:{session.activeContextId ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">IP: {session.ipAddress ?? "unknown"}</p>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail (Actor = User)</CardTitle>
          <CardDescription>
            Most recent actions performed by this user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.auditEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No audit events recorded for this user.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-widest text-gray-500">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Scope</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {user.auditEvents.map((audit) => (
                    <tr key={audit.id} className="border-b border-gray-200/60 align-top">
                      <td className="py-3 pr-4 text-gray-500">{audit.action}</td>
                      <td className="py-3 pr-4 text-gray-500">{audit.scopeType}:{audit.scopeId}</td>
                      <td className="py-3 pr-4 text-gray-500">{audit.targetType}:{audit.targetId}</td>
                      <td className="py-3 pr-4 text-gray-500">{audit.reason ?? "-"}</td>
                      <td className="py-3 text-gray-500">{audit.createdAt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
