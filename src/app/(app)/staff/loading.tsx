import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function StaffLoading() {
  return <RouteLoadingSkeleton title="Loading staff workspace" blocks={3} />;
}
