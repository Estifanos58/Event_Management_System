"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RealtimeFeedItem } from "@/components/staff/realtime/use-checkin-realtime";

type RealtimeEventFeedProps = {
  feed: RealtimeFeedItem[];
};

export function RealtimeEventFeed({ feed }: RealtimeEventFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Realtime Event Feed</CardTitle>
        <CardDescription>
          Latest check-in, gate load, and incident stream activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {feed.length === 0 ? (
          <p className="text-sm text-gray-500">No realtime events received yet.</p>
        ) : (
          <div className="space-y-2">
            {feed.map((entry) => (
              <article
                key={entry.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{entry.summary}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.occurredAt).toLocaleTimeString()}</p>
                </div>
                <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">{entry.type}</p>
                {entry.channel ? <p className="mt-1 text-xs text-gray-500">{entry.channel}</p> : null}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
