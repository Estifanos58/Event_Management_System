"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StaffGateOption } from "@/components/staff/checkin/types";

type ManualCheckInFormProps = {
  gates: StaffGateOption[];
  disabled?: boolean;
  onSubmit: (input: {
    gateId: string;
    reason: string;
    ticketId?: string;
    qrToken?: string;
  }) => Promise<void> | void;
};

export function ManualCheckInForm({
  gates,
  disabled = false,
  onSubmit,
}: ManualCheckInFormProps) {
  const [gateId, setGateId] = useState(() => gates[0]?.id ?? "");
  const [ticketId, setTicketId] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTicketId = ticketId.trim();
    const trimmedQr = qrToken.trim();
    const trimmedReason = reason.trim();

    if (!trimmedTicketId && !trimmedQr) {
      setValidationError("Provide either a ticket id or a QR token.");
      return;
    }

    if (!trimmedReason) {
      setValidationError("Manual override reason is required.");
      return;
    }

    setValidationError(null);
    setPending(true);

    try {
      await onSubmit({
        gateId,
        reason: trimmedReason,
        ticketId: trimmedTicketId || undefined,
        qrToken: trimmedQr || undefined,
      });

      setTicketId("");
      setQrToken("");
      setReason("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-base font-semibold text-gray-900">Manual Check-In Override</p>
        <p className="mt-1 text-sm text-gray-500">
          Use only when scanner-based flow cannot resolve a valid ticket.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-2">
        <label className="text-sm font-medium text-gray-900">
          Ticket id
          <Input
            className="mt-1"
            value={ticketId}
            onChange={(event) => setTicketId(event.target.value)}
            placeholder="cuid ticket id"
          />
        </label>

        <label className="text-sm font-medium text-gray-900">
          QR token
          <Input
            className="mt-1"
            value={qrToken}
            onChange={(event) => setQrToken(event.target.value)}
            placeholder="ticket_qr_token"
          />
        </label>

        <label className="text-sm font-medium text-gray-900">
          Gate
          <Select
            className="mt-1"
            value={gateId}
            onChange={(event) => setGateId(event.target.value)}
            disabled={gates.length === 0}
          >
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id}>
                {gate.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-sm font-medium text-gray-900 lg:col-span-2">
          Override reason
          <Textarea
            className="mt-1"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Scanner unreadable, manually validated attendee identity."
            required
          />
        </label>

        {validationError ? (
          <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 lg:col-span-2">
            {validationError}
          </p>
        ) : null}

        <div className="lg:col-span-2">
          <Button type="submit" disabled={disabled || pending || gates.length === 0}>
            {pending ? "Submitting..." : "Submit manual check-in"}
          </Button>
        </div>
      </form>
    </section>
  );
}
