"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { ModerationAppealEntry } from "@/domains/moderation/types";

type AdminReappealsPanelProps = {
  items: ModerationAppealEntry[];
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminReappealsPanel({ items }: AdminReappealsPanelProps) {
  const router = useRouter();
  const [selectedAppeal, setSelectedAppeal] = useState<ModerationAppealEntry | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function decideAppeal(decision: "APPROVED" | "REJECTED") {
    if (!selectedAppeal) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/moderation/appeals/${selectedAppeal.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(parseError(payload, "Failed to review moderation appeal."));
      }

      toast.success(`Appeal ${decision === "APPROVED" ? "approved" : "rejected"}.`);
      setSelectedAppeal(null);
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to review moderation appeal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!items.length) {
    return <p className="text-sm text-gray-500">No moderation appeals found for the selected filter.</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((appeal) => (
          <article key={appeal.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {appeal.status} - {appeal.ban.scope}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Requester: {appeal.requesterName} ({appeal.requesterEmail})
                </p>
                <p className="mt-1 text-xs text-gray-500">Created: {formatDateTime(appeal.createdAt)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedAppeal(appeal);
                  setNote(appeal.reviewerNote ?? "");
                }}
              >
                View and review
              </Button>
            </div>

            <p className="mt-3 line-clamp-2 text-sm text-gray-700">{appeal.message}</p>
          </article>
        ))}
      </div>

      <Modal
        open={Boolean(selectedAppeal)}
        onClose={() => setSelectedAppeal(null)}
        title="Moderation appeal detail"
        description="Review context and decide whether to lift or keep restriction."
        footer={
          selectedAppeal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedAppeal(null)} disabled={isSubmitting}>
                Close
              </Button>
              <Button
                className="h-10 bg-gray-700 text-white hover:bg-gray-800"
                onClick={() => decideAppeal("REJECTED")}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Reject"}
              </Button>
              <Button
                className="h-10 bg-green-600 text-white hover:bg-green-700"
                onClick={() => decideAppeal("APPROVED")}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Approve and lift ban"}
              </Button>
            </div>
          ) : null
        }
      >
        {selectedAppeal ? (
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">Appeal details</p>
              <p className="mt-1">Status: {selectedAppeal.status}</p>
              <p>Ban scope: {selectedAppeal.ban.scope}</p>
              <p>Ban reason: {selectedAppeal.ban.reason}</p>
              <p>Requester: {selectedAppeal.requesterName}</p>
            </div>

            <div>
              <p className="font-semibold text-gray-900">Appeal message</p>
              <p className="mt-1 whitespace-pre-wrap">{selectedAppeal.message}</p>
            </div>

            <label className="block">
              <span className="font-semibold text-gray-900">Reviewer note</span>
              <Textarea
                className="mt-1"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional decision note that will be included in notifications."
                disabled={isSubmitting}
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
