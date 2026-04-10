import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function OrganizerLoading() {
  return <RouteLoadingSkeleton title="Loading organizer workspace" blocks={3} />;
}
