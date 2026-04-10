import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyNotificationPreferences } from "@/domains/notifications/service";
import { requireDashboardSnapshot } from "../_lib/access";

function asEnabledLabel(value: boolean) {
  return value ? "Enabled" : "Disabled";
}

export default async function ProfilePage() {
  const snapshot = await requireDashboardSnapshot();
  const preferences = await getMyNotificationPreferences().catch(() => null);
  const user = snapshot.session.user;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Profile Overview</h1>
        <p className="mt-2 text-sm text-gray-500">
          Account identity, context footprint, and communication preference summary.
        </p>
      </header>

      <main className="space-y-6">
        <section>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Name</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{user.name}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Email</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{user.email}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Contexts</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{snapshot.contexts.length}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Permissions</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {snapshot.permissions?.permissions.size ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context Memberships</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {snapshot.contexts.length === 0 ? (
                <p className="text-gray-500">No additional contexts are available for this account.</p>
              ) : (
                snapshot.contexts.map((context) => (
                  <div
                    key={`${context.type}:${context.id}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <p className="font-semibold text-gray-900">{context.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-gray-500">
                      {context.type} · {context.role}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Current delivery channels for personal communications.</CardDescription>
            </CardHeader>
            <CardContent>
              {!preferences ? (
                <p className="text-sm text-gray-500">Preferences could not be loaded right now.</p>
              ) : (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Email</p>
                    <p className="mt-2 font-semibold text-gray-900">{asEnabledLabel(preferences.emailEnabled)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">SMS</p>
                    <p className="mt-2 font-semibold text-gray-900">{asEnabledLabel(preferences.smsEnabled)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Push</p>
                    <p className="mt-2 font-semibold text-gray-900">{asEnabledLabel(preferences.pushEnabled)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">In-app</p>
                    <p className="mt-2 font-semibold text-gray-900">{asEnabledLabel(preferences.inAppEnabled)}</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link href="/notifications" className="font-semibold text-orange-500 hover:text-orange-600">
                  Open notifications
                </Link>
                <Link href="/context" className="font-semibold text-orange-500 hover:text-orange-600">
                  Manage contexts
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
