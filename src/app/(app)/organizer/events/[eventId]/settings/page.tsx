import { EVENT_DUPLICATE_MODES } from "@/domains/events/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  duplicateEventFormAction,
  transitionEventStatusFormAction,
  updateEventExperienceFormAction,
} from "@/domains/events/actions";
import { getEventDetailSnapshot } from "@/domains/events/service";

type OrganizerEventSettingsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function stringifyJson(value: unknown) {
  if (!value) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

export default async function OrganizerEventSettingsPage({
  params,
}: OrganizerEventSettingsPageProps) {
  const { eventId } = await params;
  const snapshot = await getEventDetailSnapshot(eventId);

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-gray-500">
          Event settings are unavailable in the current context.
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

  const { event, transitions } = snapshot;
  const transitionAction = transitionEventStatusFormAction;
  const experienceAction = updateEventExperienceFormAction;
  const duplicateAction = duplicateEventFormAction;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle Governance</CardTitle>
          <CardDescription>
            Transition status to the next permitted lifecycle phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No transitions are currently available from status {event.status}.
            </p>
          ) : (
            <form action={transitionAction} className="grid gap-3 lg:grid-cols-[260px_1fr_auto]">
              <input type="hidden" name="eventId" value={event.id} />

              <label className="text-sm font-medium text-gray-900">
                Next status
                <Select className="mt-1" name="nextStatus" defaultValue={transitions[0]}>
                  {transitions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-sm font-medium text-gray-900">
                Reason
                <Input className="mt-1" name="reason" placeholder="Reason for lifecycle change" />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Transition
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience Configuration</CardTitle>
          <CardDescription>
            Public page branding, form configuration, and organizer communication defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={experienceAction} className="grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="eventId" value={event.id} />

            <label className="text-sm font-medium text-gray-900">
              Slug
              <Input className="mt-1" name="slug" defaultValue={event.slug ?? ""} />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Branding theme
              <Input className="mt-1" name="brandingTheme" defaultValue={event.brandingTheme ?? ""} />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Logo URL
              <Input className="mt-1" name="brandingLogoUrl" defaultValue={event.brandingLogoUrl ?? ""} />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Primary color
              <Input
                className="mt-1"
                name="brandingPrimaryColor"
                defaultValue={event.brandingPrimaryColor ?? ""}
                placeholder="#2563eb"
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Accent color
              <Input
                className="mt-1"
                name="brandingAccentColor"
                defaultValue={event.brandingAccentColor ?? ""}
                placeholder="#0f766e"
              />
            </label>

            <label className="text-sm font-medium text-gray-900">
              Reminder lead hours
              <Input
                className="mt-1"
                name="reminderLeadHours"
                type="number"
                min={0}
                defaultValue={event.reminderLeadHours ?? ""}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                className="h-4 w-4"
                type="checkbox"
                name="referralEnabled"
                defaultChecked={event.referralEnabled}
              />
              Referral enabled
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                className="h-4 w-4"
                type="checkbox"
                name="campaignTrackingEnabled"
                defaultChecked={event.campaignTrackingEnabled}
              />
              Campaign tracking enabled
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Registration form config (JSON)
              <Textarea
                className="mt-1"
                name="registrationFormConfig"
                rows={4}
                defaultValue={stringifyJson(event.registrationFormConfig)}
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Confirmation email template
              <Textarea
                className="mt-1"
                name="confirmationEmailTemplate"
                rows={4}
                defaultValue={event.confirmationEmailTemplate ?? ""}
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Reminder email template
              <Textarea
                className="mt-1"
                name="reminderEmailTemplate"
                rows={4}
                defaultValue={event.reminderEmailTemplate ?? ""}
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Organizer announcement template
              <Textarea
                className="mt-1"
                name="organizerAnnouncementTemplate"
                rows={4}
                defaultValue={event.organizerAnnouncementTemplate ?? ""}
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Share message
              <Textarea
                className="mt-1"
                name="shareMessage"
                rows={3}
                defaultValue={event.shareMessage ?? ""}
              />
            </label>

            <label className="text-sm font-medium text-gray-900 lg:col-span-2">
              Referral default code
              <Input
                className="mt-1"
                name="referralDefaultCode"
                defaultValue={event.referralDefaultCode ?? ""}
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
              >
                Save experience settings
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Event</CardTitle>
          <CardDescription>
            Create a new draft event from this event using a controlled copy mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={duplicateAction} className="grid gap-3 lg:grid-cols-[320px_auto]">
            <input type="hidden" name="eventId" value={event.id} />

            <label className="text-sm font-medium text-gray-900">
              Copy mode
              <Select className="mt-1" name="mode" defaultValue={EVENT_DUPLICATE_MODES[0]}>
                {EVENT_DUPLICATE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100"
              >
                Duplicate as draft
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
