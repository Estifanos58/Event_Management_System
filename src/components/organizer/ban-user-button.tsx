"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type BanUserButtonProps = {
  userId: string;
  organizationId: string;
  userLabel: string;
};

type ApiErrorShape = {
  error?: string;
  message?: string;
};

function parseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const casted = payload as ApiErrorShape;
  return casted.error ?? casted.message ?? fallback;
}

export function BanUserButton({ userId, organizationId, userLabel }: BanUserButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitBan() {
    const trimmedReason = reason.trim();

    if (trimmedReason.length < 4) {
      toast.error("Please provide a reason for the ban.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/moderation/bans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "ORGANIZATION_USER",
          subjectUserId: userId,
          scopeOrganizationId: organizationId,
          reason: trimmedReason,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(parseError(payload, "Failed to create organizer-scoped ban."));
      }

      toast.success("Organizer-scoped ban applied.");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create organizer-scoped ban.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 border border-red-200 bg-white px-2 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Ban
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ban attendee"
        description={`Restrict ${userLabel} from booking and commenting for this organizer.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              className="h-10 bg-red-600 text-white hover:bg-red-700"
              onClick={submitBan}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Applying..." : "Apply ban"}
            </Button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-gray-900">
          Ban reason
          <Textarea
            className="mt-1"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Provide details for why this user is being restricted."
            disabled={isSubmitting}
          />
        </label>
      </Modal>
    </>
  );
}
