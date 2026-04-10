"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function OrganizerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Organizer view error"
      description="The organizer route failed while loading."
      error={error}
      onRetry={reset}
    />
  );
}
