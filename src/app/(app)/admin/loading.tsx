import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function AdminLoading() {
  return <RouteLoadingSkeleton title="Loading admin workspace" blocks={4} />;
}
