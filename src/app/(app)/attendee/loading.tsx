import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function AttendeeLoading() {
  return <RouteLoadingSkeleton title="Loading attendee workspace" blocks={3} />;
}
