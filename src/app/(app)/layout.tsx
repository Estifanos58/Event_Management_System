import Link from "next/link";
import { ScopeType } from "@prisma/client";
import { BanStatusBanner } from "@/components/layout/ban-status-banner";
import { signOutAction } from "@/domains/identity/actions";
import { listActiveBansForUser } from "@/domains/moderation/service";
import {
  LayoutDashboard,
  Compass,
  Calendar,
  ShieldCheck,
  Settings,
  Bell,
  User,
  LogOut,
  ChevronRight,
} from "lucide-react";
import {
  getActiveContextLabel,
  hasAdminAccess,
  hasOrganizerAccess,
  hasStaffAccess,
  requireDashboardSnapshot,
} from "./_lib/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await requireDashboardSnapshot();
  const activeBans = await listActiveBansForUser(snapshot.session.user.id);

  const organizationContext = snapshot.contexts.find(
    (context) => context.type === ScopeType.ORGANIZATION,
  );
  const organizationAction = organizationContext
    ? {
        href: "/organizer/dashboard",
        label: organizationContext.label,
      }
    : {
        href: "/onboarding",
        label: "Create Organization",
      };

  const showOrganizer = hasOrganizerAccess(snapshot);
  const showStaff = hasStaffAccess(snapshot);
  const showAdmin = hasAdminAccess(snapshot);
  const activeContextLabel = getActiveContextLabel(snapshot);

  return (
    <div className="flex min-h-screen w-full bg-gray-50 text-gray-900">
      <aside
        className="hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex"
        aria-label="Primary workspace navigation"
      >
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-500 to-red-500 text-white shadow-sm">
            <Compass className="h-5 w-5" />
          </div>
          <span className="ml-3 font-bold tracking-tight">Event Empire</span>
        </div>

        <nav className="flex-1 space-y-1.5 p-4" aria-label="Workspace sections">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Discover</p>
          <Link
            href="/discover"
            className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600"
          >
            <Compass className="h-4 w-4" /> Discover Events
          </Link>

          <div className="pt-4" />
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">My Activity</p>
          <Link
            href="/attendee/dashboard"
            className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <LayoutDashboard className="h-4 w-4" /> My Tickets
          </Link>
          <Link
            href={organizationAction.href}
            className="group flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Calendar className="h-4 w-4" /> {organizationAction.label}
          </Link>

          {showOrganizer || showStaff || showAdmin ? <div className="pt-4" /> : null}
          {showOrganizer || showStaff || showAdmin ? (
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Workspace
            </p>
          ) : null}

          {showOrganizer ? (
            <Link
              href="/organizer/dashboard"
              className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <Calendar className="h-4 w-4" /> Organizer
            </Link>
          ) : null}
          {showStaff ? (
            <Link
              href="/staff/dashboard"
              className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <ShieldCheck className="h-4 w-4" /> Staff Operations
            </Link>
          ) : null}
          {showAdmin ? (
            <Link
              href="/admin/dashboard"
              className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <Settings className="h-4 w-4" /> Platform Admin
            </Link>
          ) : null}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <Link
            href="/context"
            className="flex flex-col rounded-xl bg-gray-50 p-3 transition-colors hover:bg-orange-50"
          >
            <span className="text-xs font-medium text-gray-500">Current Context</span>
            <span className="mt-1 flex items-center justify-between text-sm font-semibold text-gray-900">
              {activeContextLabel}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </span>
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <div className="flex items-center gap-4 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-500 to-red-500 text-white shadow-sm">
              <Compass className="h-5 w-5" />
            </div>
            <span className="font-bold">Event Empire</span>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
              Role & Context
            </span>
            <p className="text-sm font-medium text-gray-600">{activeContextLabel}</p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/notifications"
              className="relative rounded-full p-2 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </Link>

            <div className="h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-3">
              <Link href="/profile" className="flex items-center gap-2 rounded-full transition-colors hover:opacity-80">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  <User className="h-4 w-4" />
                </div>
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8" id="main-content">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <BanStatusBanner bans={activeBans} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
