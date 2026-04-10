"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Authentication error"
      description="The authentication route failed to load."
      error={error}
      onRetry={reset}
    />
  );
}
