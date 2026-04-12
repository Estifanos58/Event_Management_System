"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type AbuseReportItem = {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  status: string;
  description: string;
  evidenceUrls: string[];
  createdAt: string;
  organizationId: string | null;
  reporter: {
    name: string;
    email: string;
  };
  event: {
    title: string;
  } | null;
};

type RiskCaseItem = {
  id: string;
  scopeType: string;
  scopeId: string;
  source: string;
  severity: string;
  status: string;
  createdAt: string;
  event: {
    title: string;
  } | null;
};

type ModerationQueuePanelProps = {
  abuseReports: AbuseReportItem[];
  riskCases: RiskCaseItem[];
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

export function ModerationQueuePanel({ abuseReports, riskCases }: ModerationQueuePanelProps) {
  const router = useRouter();
  const [selectedReport, setSelectedReport] = useState<AbuseReportItem | null>(null);
  const [selectedRiskCase, setSelectedRiskCase] = useState<RiskCaseItem | null>(null);
  const [banReason, setBanReason] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  async function applyBan(payload: Record<string, unknown>) {
    setIsApplying(true);

    try {
      const response = await fetch("/api/moderation/bans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(parseError(responsePayload, "Failed to apply moderation ban."));
      }

      toast.success("Moderation ban applied.");
      setSelectedReport(null);
      setBanReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply moderation ban.");
    } finally {
      setIsApplying(false);
    }
  }

  function normalizedBanReason(report: AbuseReportItem) {
    const trimmed = banReason.trim();

    if (trimmed.length >= 4) {
      return trimmed;
    }

    return `Moderation action from abuse report ${report.id}`;
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h2 className="text-base font-semibold text-gray-900">Abuse Reports</h2>
            <p className="text-sm text-gray-500">Latest abuse submissions across platform targets.</p>
          </header>

          {abuseReports.length === 0 ? (
            <p className="text-sm text-gray-500">No abuse reports found.</p>
          ) : (
            <div className="space-y-2">
              {abuseReports.map((report) => (
                <article key={report.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{report.category}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {report.status} - {report.targetType}:{report.targetId}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Reporter: {report.reporter.name || report.reporter.email}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Event: {report.event?.title ?? "n/a"} - {formatDateTime(report.createdAt)}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setSelectedReport(report);
                      setBanReason("");
                    }}
                  >
                    View details
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h2 className="text-base font-semibold text-gray-900">Risk Cases</h2>
            <p className="text-sm text-gray-500">Active and historical risk cases with severity indicators.</p>
          </header>

          {riskCases.length === 0 ? (
            <p className="text-sm text-gray-500">No risk cases found.</p>
          ) : (
            <div className="space-y-2">
              {riskCases.map((riskCase) => (
                <article key={riskCase.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {riskCase.source} - {riskCase.severity}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {riskCase.status} - {riskCase.scopeType}:{riskCase.scopeId}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Event: {riskCase.event?.title ?? "n/a"} - {formatDateTime(riskCase.createdAt)}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => setSelectedRiskCase(riskCase)}
                  >
                    View details
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        title="Abuse report details"
        description="Review evidence and apply restriction actions."
        footer={
          selectedReport ? (
            <div className="flex flex-wrap gap-2">
              {selectedReport.targetType === "USER" ? (
                <Button
                  className="h-10 bg-red-600 text-white hover:bg-red-700"
                  onClick={() =>
                    applyBan({
                      scope: "GLOBAL_USER",
                      subjectUserId: selectedReport.targetId,
                      sourceReportId: selectedReport.id,
                      reason: normalizedBanReason(selectedReport),
                    })
                  }
                  disabled={isApplying}
                >
                  {isApplying ? "Applying..." : "Global user ban"}
                </Button>
              ) : null}

              {selectedReport.targetType === "USER" && selectedReport.organizationId ? (
                <Button
                  className="h-10 bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() =>
                    applyBan({
                      scope: "ORGANIZATION_USER",
                      subjectUserId: selectedReport.targetId,
                      scopeOrganizationId: selectedReport.organizationId,
                      sourceReportId: selectedReport.id,
                      reason: normalizedBanReason(selectedReport),
                    })
                  }
                  disabled={isApplying}
                >
                  {isApplying ? "Applying..." : "Organizer-scoped user ban"}
                </Button>
              ) : null}

              {selectedReport.organizationId ? (
                <Button
                  className="h-10 bg-red-700 text-white hover:bg-red-800"
                  onClick={() =>
                    applyBan({
                      scope: "GLOBAL_ORGANIZATION",
                      subjectOrganizationId: selectedReport.organizationId,
                      sourceReportId: selectedReport.id,
                      reason: normalizedBanReason(selectedReport),
                    })
                  }
                  disabled={isApplying}
                >
                  {isApplying ? "Applying..." : "Global organization ban"}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selectedReport ? (
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">Report metadata</p>
              <p className="mt-1">Category: {selectedReport.category}</p>
              <p>Status: {selectedReport.status}</p>
              <p>
                Target: {selectedReport.targetType}:{selectedReport.targetId}
              </p>
              <p>Created: {formatDateTime(selectedReport.createdAt)}</p>
            </div>

            <div>
              <p className="font-semibold text-gray-900">Description</p>
              <p className="mt-1 whitespace-pre-wrap">{selectedReport.description}</p>
            </div>

            <div>
              <p className="font-semibold text-gray-900">Evidence URLs</p>
              {selectedReport.evidenceUrls.length === 0 ? (
                <p className="mt-1 text-gray-500">No evidence URLs attached.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {selectedReport.evidenceUrls.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer" className="text-orange-600 hover:text-orange-700">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="block">
              <span className="font-semibold text-gray-900">Action reason</span>
              <Textarea
                className="mt-1"
                rows={4}
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                placeholder="Add the moderation reason that should be included in audit and notifications."
                disabled={isApplying}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedRiskCase)}
        onClose={() => setSelectedRiskCase(null)}
        title="Risk case details"
        description="Investigate the risk source and severity context."
      >
        {selectedRiskCase ? (
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-semibold text-gray-900">Source:</span> {selectedRiskCase.source}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Severity:</span> {selectedRiskCase.severity}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Status:</span> {selectedRiskCase.status}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Scope:</span> {selectedRiskCase.scopeType}:{selectedRiskCase.scopeId}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Event:</span> {selectedRiskCase.event?.title ?? "n/a"}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Created:</span> {formatDateTime(selectedRiskCase.createdAt)}
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
