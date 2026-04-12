"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { ModerationBanEntry } from "@/domains/moderation/types";

type BanStatusBannerProps = {
  bans: ModerationBanEntry[];
  title?: string;
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

function getBanScopeLabel(ban: ModerationBanEntry) {
  if (ban.scope === "GLOBAL_USER") {
    return "Global user restriction";
  }

  if (ban.scope === "GLOBAL_ORGANIZATION") {
    return "Global organization restriction";
  }

  return "Organizer restriction";
}

function getBanContextLabel(ban: ModerationBanEntry) {
  if (ban.scope === "GLOBAL_ORGANIZATION") {
    return ban.subjectOrganizationName ?? ban.subjectOrganizationId ?? "organization";
  }

  if (ban.scope === "ORGANIZATION_USER") {
    return ban.scopeOrganizationName ?? ban.scopeOrganizationId ?? "organization";
  }

  return "platform";
}

export function BanStatusBanner({ bans, title }: BanStatusBannerProps) {
  const [open, setOpen] = useState(false);
  const [selectedBanId, setSelectedBanId] = useState<string>(bans[0]?.id ?? "");
  const [appealMessage, setAppealMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedBan = useMemo(
    () => bans.find((ban) => ban.id === selectedBanId) ?? bans[0] ?? null,
    [bans, selectedBanId],
  );

  if (!bans.length) {
    return null;
  }

  async function submitAppeal() {
    if (!selectedBan) {
      toast.error("No active ban is selected for appeal.");
      return;
    }

    const trimmedMessage = appealMessage.trim();
    if (trimmedMessage.length < 8) {
      toast.error("Please provide a detailed appeal message.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/moderation/appeals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          banId: selectedBan.id,
          message: trimmedMessage,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(parseError(payload, "Failed to submit moderation appeal."));
      }

      toast.success("Appeal submitted. It is now pending review.");
      setAppealMessage("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit moderation appeal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {title ?? "Active moderation restriction"}
            </p>
            <p className="mt-1 text-sm">
              {bans.length === 1
                ? `${getBanScopeLabel(bans[0]!)} on ${getBanContextLabel(bans[0]!)}.`
                : `${bans.length} active moderation restrictions detected on your account contexts.`}
            </p>
            <p className="mt-2 text-xs text-red-800">
              Reason: {bans[0]!.reason}
            </p>
          </div>

          <Button
            variant="secondary"
            className="h-9 border border-red-300 bg-white text-red-700 hover:bg-red-100"
            onClick={() => setOpen(true)}
          >
            Reappeal
          </Button>
        </div>
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Submit moderation reappeal"
        description="Choose the active restriction and explain why it should be lifted."
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitAppeal} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit appeal"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-900">
            Restricted context
            <select
              value={selectedBan?.id ?? ""}
              onChange={(event) => setSelectedBanId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {bans.map((ban) => (
                <option key={ban.id} value={ban.id}>
                  {getBanScopeLabel(ban)} - {getBanContextLabel(ban)}
                </option>
              ))}
            </select>
          </label>

          {selectedBan ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">Current restriction</p>
              <p className="mt-1">{selectedBan.reason}</p>
            </div>
          ) : null}

          <label className="block text-sm font-medium text-gray-900">
            Appeal details
            <Textarea
              className="mt-1"
              rows={5}
              value={appealMessage}
              onChange={(event) => setAppealMessage(event.target.value)}
              placeholder="Provide details, context, and any corrective actions taken."
              disabled={isSubmitting}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
