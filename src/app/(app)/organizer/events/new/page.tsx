"use client";

import { useActionState } from "react";
import { createEventDraftAction } from "@/domains/events/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function OrganizerCreateEventPage() {
  const [state, formAction, pending] = useActionState(createEventDraftAction, undefined);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Event</CardTitle>
          <CardDescription>
            This form submits directly to organizer createEventDraftAction and redirects to the event workspace on success.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Title
              <Input className="mt-1" name="title" required placeholder="Event title" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Description
              <Textarea className="mt-1" name="description" rows={4} placeholder="Event description" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Event cover image URL
              <Input
                className="mt-1"
                name="coverImageUrl"
                type="url"
                placeholder="https://images.unsplash.com/..."
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Event gallery image URLs (one URL per line)
              <Textarea
                className="mt-1"
                name="galleryImages"
                rows={4}
                placeholder="https://images.unsplash.com/...\nhttps://images.unsplash.com/..."
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Visibility
              <Select className="mt-1" name="visibility" defaultValue="PUBLIC">
                <option value="PUBLIC">PUBLIC</option>
                <option value="UNLISTED">UNLISTED</option>
                <option value="PRIVATE">PRIVATE</option>
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Venue mode
              <Select className="mt-1" name="venueMode" defaultValue="PHYSICAL">
                <option value="PHYSICAL">PHYSICAL</option>
                <option value="VIRTUAL">VIRTUAL</option>
                <option value="HYBRID">HYBRID</option>
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Registration type
              <Select className="mt-1" name="registrationType" defaultValue="OPEN">
                <option value="OPEN">OPEN</option>
                <option value="APPROVAL_REQUIRED">APPROVAL_REQUIRED</option>
                <option value="APPLICATION_BASED">APPLICATION_BASED</option>
              </Select>
            </label>

            <label className="text-sm font-medium text-gray-900">
              Total capacity
              <Input className="mt-1" name="totalCapacity" type="number" min={1} placeholder="Optional" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Timezone
              <Input className="mt-1" name="timezone" defaultValue="Africa/Addis_Ababa" required />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Start at
              <Input className="mt-1" name="startAt" type="datetime-local" required />
            </label>

            <label className="text-sm font-medium text-gray-900">
              End at
              <Input className="mt-1" name="endAt" type="datetime-local" required />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Publish at (optional)
              <Input className="mt-1" name="publishAt" type="datetime-local" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Venue name
              <Input className="mt-1" name="venueName" placeholder="Venue name" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Venue address
              <Input className="mt-1" name="venueAddress" placeholder="Venue address" />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Virtual meeting URL
              <Input className="mt-1" name="virtualMeetingUrl" type="url" placeholder="https://..." />
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 lg:col-span-2">
              <input name="waitlistEnabled" type="checkbox" className="h-4 w-4" />
              Enable waitlist
            </label>

            <hr className="lg:col-span-2 border-gray-200" />

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Seed session title (optional)
              <Input className="mt-1" name="seedSessionTitle" placeholder="Opening session" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Seed session room
              <Input className="mt-1" name="seedSessionRoom" placeholder="Main hall" />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Seed session capacity
              <Input className="mt-1" name="seedSessionCapacity" type="number" min={1} defaultValue={100} />
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 lg:col-span-2">
              <input name="seedSessionWaitlist" type="checkbox" className="h-4 w-4" />
              Seed session waitlist enabled
            </label>

            {state?.error ? (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-2">
                {state.error}
              </p>
            ) : null}

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Creating event..." : "Create draft event"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
