"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Public page error"
      description="We could not load this public route."
      error={error}
      onRetry={reset}
    />
  );
}
