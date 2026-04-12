"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ReportTargetType = "EVENT" | "ORGANIZER" | "USER";

type ReportTargetButtonProps = {
  eventId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

type ApiErrorShape = {
  error?: string;
  message?: string;
};

const TARGET_CATEGORY_OPTIONS: Record<ReportTargetType, string[]> = {
  EVENT: [
    "FRAUD_SCAM",
    "MISLEADING_INFORMATION",
    "SAFETY_ISSUE",
    "INAPPROPRIATE_CONTENT",
    "OTHER",
  ],
  ORGANIZER: [
    "REPEATED_CANCELLATIONS",
    "POOR_MANAGEMENT",
    "ABUSE_OR_HARASSMENT",
    "OTHER",
  ],
  USER: ["ABUSE_OR_HARASSMENT", "FRAUD_SCAM", "OTHER"],
};

function parseApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const casted = payload as ApiErrorShape;
  return casted.error ?? casted.message ?? fallback;
}

function formatCategoryLabel(value: string) {
  return value
    .split("_")
    .map((segment) => segment[0] + segment.slice(1).toLowerCase())
    .join(" ");
}

export function ReportTargetButton({
  eventId,
  targetType,
  targetId,
  targetLabel,
  triggerLabel,
  triggerClassName,
}: ReportTargetButtonProps) {
  const categoryOptions = useMemo(() => TARGET_CATEGORY_OPTIONS[targetType], [targetType]);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categoryOptions[0] ?? "OTHER");
  const [description, setDescription] = useState("");
  const [evidenceUrlsInput, setEvidenceUrlsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setCategory(categoryOptions[0] ?? "OTHER");
    setDescription("");
    setEvidenceUrlsInput("");
  }

  function openModal() {
    setOpen(true);
  }

  function closeModal() {
    if (isSubmitting) {
      return;
    }

    setOpen(false);
  }

  async function submitReport() {
    const trimmedDescription = description.trim();

    if (trimmedDescription.length < 10) {
      toast.error("Please provide at least 10 characters in the report description.");
      return;
    }

    if (trimmedDescription.length > 2_000) {
      toast.error("Report description must not exceed 2000 characters.");
      return;
    }

    const evidenceUrls = evidenceUrlsInput
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/events/${eventId}/moderation/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType,
          targetId,
          category,
          description: trimmedDescription,
          evidenceUrls,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(parseApiError(payload, "Failed to submit abuse report."));
      }

      toast.success("Report submitted to moderation.");
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit abuse report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={triggerClassName}
        onClick={openModal}
      >
        {triggerLabel ?? "Report"}
      </Button>

      <Modal
        open={open}
        onClose={closeModal}
        title="Report abuse"
        description={`Report ${targetLabel} to moderation for review.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit report"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-900">
            Category
            <Select
              className="mt-1"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={isSubmitting}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {formatCategoryLabel(option)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block text-sm font-medium text-gray-900">
            Description
            <Textarea
              className="mt-1"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what happened and why this should be reviewed."
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm font-medium text-gray-900">
            Evidence URLs (optional, one per line)
            <Textarea
              className="mt-1"
              rows={3}
              value={evidenceUrlsInput}
              onChange={(event) => setEvidenceUrlsInput(event.target.value)}
              placeholder="https://example.com/evidence-1"
              disabled={isSubmitting}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}