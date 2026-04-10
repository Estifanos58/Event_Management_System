import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listDiscoverableEvents } from "@/domains/discovery/service";

export default async function AboutPage() {
  const discoverSnapshot = await listDiscoverableEvents({
    page: "1",
    pageSize: "1",
    sort: "relevance",
  }).catch(() => null);

  const publishedEventCount = discoverSnapshot?.total;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">About The Platform</h1>
        <p className="mt-2 text-sm text-gray-500">
          End-to-end workflows for discovery, checkout, event operations, and governance.
        </p>
      </header>

      <main className="space-y-6">
        <section>
          <Card>
            <CardHeader>
              <CardTitle>What We Power</CardTitle>
              <CardDescription>
                A role-aware workspace that keeps event operations auditable and reliable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-500">
              <p>
                The platform connects attendees, organizers, staff, and administrators with shared
                workflows and clear accountability.
              </p>
              {typeof publishedEventCount === "number" ? (
                <p>
                  Current discovery index:{" "}
                  <span className="font-semibold text-gray-900">{publishedEventCount}</span> published or
                  discoverable events.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendee Experience</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">
              Discover events, reserve tickets, checkout securely, and manage orders and tickets.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organizer Control</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">
              Author events, configure sessions and ticketing, monitor analytics, and track finance.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operational Reliability</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">
              Staff check-in tools, incident workflows, and admin monitoring for trust and safety.
            </CardContent>
          </Card>
        </section>
      </main>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href="/discover" className="font-medium text-orange-500 hover:text-orange-600">
              Browse events
            </Link>
            <Link href="/register" className="font-medium text-orange-500 hover:text-orange-600">
              Create account
            </Link>
            <Link href="/contact" className="font-medium text-orange-500 hover:text-orange-600">
              Contact support
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
