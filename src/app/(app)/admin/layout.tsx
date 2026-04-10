import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminAccess, requireDashboardSnapshot } from "../_lib/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await requireDashboardSnapshot();
  const navLinkClass =
    "rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

  if (!hasAdminAccess(snapshot)) {
    redirect("/unauthorized");
  }

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
        aria-label="Admin navigation"
      >
        <Link href="/admin/dashboard" className={navLinkClass}>
          Dashboard
        </Link>
        <Link href="/admin/users" className={navLinkClass}>
          Users
        </Link>
        <Link href="/admin/organizations" className={navLinkClass}>
          Organizations
        </Link>
        <Link href="/admin/events" className={navLinkClass}>
          Events
        </Link>
        <Link href="/admin/moderation" className={navLinkClass}>
          Moderation
        </Link>
        <Link href="/admin/reports" className={navLinkClass}>
          Reports
        </Link>
        <Link href="/admin/system" className={navLinkClass}>
          System
        </Link>
        <Link href="/admin/alerts" className={navLinkClass}>
          Alerts
        </Link>
        <Link href="/admin/finance" className={navLinkClass}>
          Finance
        </Link>
        <Link href="/admin/webhooks" className={navLinkClass}>
          Webhooks
        </Link>
        <Link href="/admin/integrations" className={navLinkClass}>
          Integrations
        </Link>
        <Link href="/admin/compliance" className={navLinkClass}>
          Compliance
        </Link>
      </nav>

      {children}
    </div>
  );
}
