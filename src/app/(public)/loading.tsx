import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function PublicLoading() {
  return (
    <RouteLoadingSkeleton
      title="Loading public pages"
      description="Fetching discoverable content and public metadata."
      blocks={3}
    />
  );
}
