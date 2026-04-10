import Link from "next/link";
import { redirect } from "next/navigation";
import { hasOrganizerAccess, requireDashboardSnapshot } from "../_lib/access";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await requireDashboardSnapshot();
  const navLinkClass =
    "rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

  if (!hasOrganizerAccess(snapshot)) {
    redirect("/unauthorized");
  }

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
        aria-label="Organizer navigation"
      >
        <Link href="/organizer/dashboard" className={navLinkClass}>
          Dashboard
        </Link>
        <Link href="/organizer/events" className={navLinkClass}>
          Events
        </Link>
        <Link href="/organizer/events/new" className={navLinkClass}>
          Create event
        </Link>
      </nav>

      {children}
    </div>
  );
}
