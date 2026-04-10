import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateEventBasicsFormAction } from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEditEventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function toDateTimeLocal(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toGalleryTextareaValue(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join("\n");
}

export default async function OrganizerEditEventPage({ params }: OrganizerEditEventPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event edit workspace is unavailable in the current context.
        </CardContent>
      </Card>
    );
  }

  if (!snapshot.canManageEvent) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          You currently have read-only permissions for this event.
        </CardContent>
      </Card>
    );
  }

  const { event } = snapshot;
  const formAction = updateEventBasicsFormAction;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Event Basics</CardTitle>
        <CardDescription>
          Update title, lifecycle metadata, schedule, and registration defaults.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="eventId" value={event.id} />

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Title
            <Input className="mt-1" name="title" defaultValue={event.title} required />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Description
            <Textarea
              className="mt-1"
              name="description"
              rows={4}
              defaultValue={event.description ?? ""}
            />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Event cover image URL
            <Input
              className="mt-1"
              name="coverImageUrl"
              type="url"
              defaultValue={event.coverImageUrl ?? ""}
            />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Event gallery image URLs (one URL per line)
            <Textarea
              className="mt-1"
              name="galleryImages"
              rows={4}
              defaultValue={toGalleryTextareaValue(event.galleryImages)}
            />
          </label>

          <label className="text-sm font-medium text-gray-900">
            Visibility
            <Select className="mt-1" name="visibility" defaultValue={event.visibility}>
              <option value="PUBLIC">PUBLIC</option>
              <option value="UNLISTED">UNLISTED</option>
              <option value="PRIVATE">PRIVATE</option>
            </Select>
          </label>

          <label className="text-sm font-medium text-gray-900">
            Venue mode
            <Select className="mt-1" name="venueMode" defaultValue={event.venueMode}>
              <option value="PHYSICAL">PHYSICAL</option>
              <option value="VIRTUAL">VIRTUAL</option>
              <option value="HYBRID">HYBRID</option>
            </Select>
          </label>

          <label className="text-sm font-medium text-gray-900">
            Registration type
            <Select
              className="mt-1"
              name="registrationType"
              defaultValue={event.registrationType}
            >
              <option value="OPEN">OPEN</option>
              <option value="APPROVAL_REQUIRED">APPROVAL_REQUIRED</option>
              <option value="APPLICATION_BASED">APPLICATION_BASED</option>
            </Select>
          </label>

          <label className="text-sm font-medium text-gray-900">
            Total capacity
            <Input
              className="mt-1"
              name="totalCapacity"
              type="number"
              min={1}
              defaultValue={event.totalCapacity ?? ""}
            />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Timezone
            <Input className="mt-1" name="timezone" defaultValue={event.timezone} required />
          </label>

          <label className="text-sm font-medium text-gray-900">
            Start at
            <Input
              className="mt-1"
              name="startAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(event.startAt)}
              required
            />
          </label>

          <label className="text-sm font-medium text-gray-900">
            End at
            <Input
              className="mt-1"
              name="endAt"
              type="datetime-local"
              defaultValue={toDateTimeLocal(event.endAt)}
              required
            />
          </label>

          <label className="text-sm font-medium text-gray-900">
            Publish at
            <Input
              className="mt-1"
              name="publishAt"
              type="datetime-local"
              defaultValue={event.publishAt ? toDateTimeLocal(event.publishAt) : ""}
            />
          </label>

          <label className="text-sm font-medium text-gray-900">
            Venue name
            <Input className="mt-1" name="venueName" defaultValue={event.venueName ?? ""} />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Venue address
            <Input
              className="mt-1"
              name="venueAddress"
              defaultValue={event.venueAddress ?? ""}
            />
          </label>

          <label className="text-sm font-medium text-gray-900 lg:col-span-2">
            Virtual meeting URL
            <Input
              className="mt-1"
              name="virtualMeetingUrl"
              type="url"
              defaultValue={event.virtualMeetingUrl ?? ""}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 lg:col-span-2">
            <input
              name="waitlistEnabled"
              type="checkbox"
              className="h-4 w-4"
              defaultChecked={event.waitlistEnabled}
            />
            Enable waitlist
          </label>

          <div className="lg:col-span-2">
            <button
              type="submit"
              className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
            >
              Save basics
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
