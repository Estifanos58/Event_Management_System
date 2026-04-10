"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8" id="main-content">
      <RouteErrorState
        title="Application error"
        description="An unexpected error interrupted page rendering."
        error={error}
        onRetry={reset}
      />
    </main>
  );
}
