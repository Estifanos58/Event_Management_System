import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Unauthorized</h1>
      <p className="mt-2 text-sm text-gray-500">
        You do not have permission to access this section with the current context.
      </p>
      <div className="mt-4">
        <Link href="/context" className="text-sm font-medium text-orange-500">
          Switch context
        </Link>
      </div>
    </section>
  );
}
