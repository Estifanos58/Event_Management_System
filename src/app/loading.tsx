import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function RootLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8" id="main-content">
      <RouteLoadingSkeleton title="Loading application" blocks={4} />
    </main>
  );
}
