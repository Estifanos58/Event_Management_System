import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function AppGroupLoading() {
  return <RouteLoadingSkeleton title="Loading workspace" blocks={3} />;
}
