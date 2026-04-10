"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Admin view error"
      description="The admin route failed while loading."
      error={error}
      onRetry={reset}
    />
  );
}
