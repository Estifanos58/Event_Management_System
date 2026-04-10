import Link from "next/link";

export default function AttendeeLayout({ children }: { children: React.ReactNode }) {
  const navLinkClass =
    "rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
        aria-label="Attendee navigation"
      >
        <Link href="/attendee/dashboard" className={navLinkClass}>
          Dashboard
        </Link>
        <Link href="/attendee/events" className={navLinkClass}>
          Events
        </Link>
        <Link href="/attendee/tickets" className={navLinkClass}>
          Tickets
        </Link>
        <Link href="/attendee/orders" className={navLinkClass}>
          Orders
        </Link>
        <Link href="/attendee/reservations" className={navLinkClass}>
          Reservations
        </Link>
      </nav>

      {children}
    </div>
  );
}
