import { switchContextFormAction } from "@/domains/identity/actions";
import { requireDashboardSnapshot } from "../_lib/access";

export default async function ContextPage() {
  const snapshot = await requireDashboardSnapshot();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Choose Your Context</h1>
        <p className="mt-2 text-sm text-gray-500">
          Switch between organization, event, and account scopes before opening restricted areas.
        </p>
      </header>

      <main>
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            {snapshot.contexts.map((context) => (
              <form
                key={`${context.type}:${context.id}`}
                action={switchContextFormAction}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{context.label}</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-gray-500">
                    {context.type} / {context.role}
                  </p>
                </div>
                <input type="hidden" name="contextType" value={context.type} />
                <input type="hidden" name="contextId" value={context.id} />
                <button
                  type="submit"
                  className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Activate
                </button>
              </form>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
