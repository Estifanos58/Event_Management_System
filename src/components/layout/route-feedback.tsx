import { Button } from "@/components/ui/button";

type RouteLoadingSkeletonProps = {
  title?: string;
  description?: string;
  blocks?: number;
};

type RouteErrorStateProps = {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
};

export function RouteLoadingSkeleton({
  title = "Loading view",
  description = "Fetching the latest data for this route.",
  blocks = 3,
}: RouteLoadingSkeletonProps) {
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: blocks }).map((_, index) => (
          <div
            key={`loading-block-${index}`}
            className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    </section>
  );
}

export function RouteErrorState({
  title = "Something went wrong",
  description = "This route could not be rendered. Try again.",
  error,
  onRetry,
}: RouteErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{description}</p>

      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {onRetry ? (
        <div className="mt-5">
          <Button onClick={onRetry}>Retry</Button>
        </div>
      ) : null}
    </section>
  );
}
