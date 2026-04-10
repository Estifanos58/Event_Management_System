import { RouteLoadingSkeleton } from "@/components/layout/route-feedback";

export default function AuthLoading() {
  return (
    <RouteLoadingSkeleton
      title="Loading authentication"
      description="Preparing sign-in and registration interfaces."
      blocks={2}
    />
  );
}
