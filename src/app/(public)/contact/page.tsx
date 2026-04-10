import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Contact and Support</h1>
        <p className="mt-2 text-sm text-gray-500">
          Reach product support, partnerships, and operational escalation channels.
        </p>
      </header>

      <main className="space-y-6">
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Support Channels</CardTitle>
              <CardDescription>Use the right inbox to get the fastest response.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-gray-500 sm:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">General support</p>
                <p className="mt-2 font-medium text-gray-900">support@event.local</p>
                <p className="mt-1">Response target: within 1 business day.</p>
              </article>

              <article className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Partnerships</p>
                <p className="mt-2 font-medium text-gray-900">partners@event.local</p>
                <p className="mt-1">Integrations, sponsorships, and platform collaborations.</p>
              </article>

              <article className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Incident escalation</p>
                <p className="mt-2 font-medium text-gray-900">incidents@event.local</p>
                <p className="mt-1">Use for critical payment, check-in, or security disruptions.</p>
              </article>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Before You Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-500">
              <p>Include event id, organization id, and approximate occurrence time when reporting issues.</p>
              <p>For attendee checkout issues, include your order id or reservation id if available.</p>
              <p>For organizer/staff issues, switch to the relevant context first to verify permissions.</p>
            </CardContent>
          </Card>
        </section>
      </main>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href="/discover" className="font-medium text-orange-500 hover:text-orange-600">
              Discover events
            </Link>
            <Link href="/login" className="font-medium text-orange-500 hover:text-orange-600">
              Sign in
            </Link>
            <Link href="/about" className="font-medium text-orange-500 hover:text-orange-600">
              About platform
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
