import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-orange-500 to-red-500 text-sm font-extrabold text-white">
              E
            </span>
            Event Empire
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Public navigation">
            <Link
              href="/discover"
              className="rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Discover
            </Link>
            <Link
              href="/about"
              className="rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="rounded-xl px-3 py-2 font-medium text-gray-600 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Contact
            </Link>
            <Link
              href="/login"
              className="ml-1 rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Login
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
