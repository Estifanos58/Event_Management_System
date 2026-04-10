import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-gray-50" id="main-content">
      <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-linear-to-br from-orange-500 to-red-500 p-12 text-white lg:flex">
        <div className="absolute -left-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-lg text-center">
          <Link
            href="/"
            className="mb-8 inline-flex items-center text-sm font-semibold tracking-wide text-white/80 transition-colors hover:text-white"
          >
            ← Back to Home
          </Link>

          <div className="mx-auto mb-10 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-orange-500 shadow-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10"
            >
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>

          <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
            Welcome Again,<br />
            To Your Event Empire
          </h1>
          <p className="text-lg font-medium text-white/90">
            Create, manage, and scale your events with the platform designed for modern
            organizers.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link
              href="/"
              className="text-sm font-medium text-orange-500 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              ← Back to Home
            </Link>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
