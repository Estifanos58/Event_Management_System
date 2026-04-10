"use client";

import { RouteErrorState } from "@/components/layout/route-feedback";

export default function AttendeeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Attendee view error"
      description="The attendee route failed while loading."
      error={error}
      onRetry={reset}
    />
  );
}
