"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Staff view error"
      description="The staff route failed while loading."
      error={error}
      onRetry={reset}
    />
  );
}
