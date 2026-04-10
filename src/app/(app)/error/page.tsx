import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppErrorInfoPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Error Recovery</CardTitle>
          <CardDescription>
            Use this page to recover when a protected route fails to render or mutate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-500">
          <p>Retry the previous action after confirming your active context and permissions.</p>
          <p>If the issue continues, open alerts and check incident timelines for related failures.</p>
          <p>Capture event id, organization id, and local timestamp before escalating support.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recovery Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/context" className="font-medium text-orange-500">
            Switch context
          </Link>
          <Link href="/attendee/dashboard" className="font-medium text-orange-500">
            Go to attendee dashboard
          </Link>
          <Link href="/admin/alerts" className="font-medium text-orange-500">
            Open admin alerts
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
