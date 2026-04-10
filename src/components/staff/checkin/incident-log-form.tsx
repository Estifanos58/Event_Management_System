"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StaffGateOption } from "@/components/staff/checkin/types";

type IncidentLogFormProps = {
  gates: StaffGateOption[];
  disabled?: boolean;
  onSubmit: (input: {
    gateId: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    message: string;
    occurredAt?: string;
  }) => Promise<void> | void;
};

export function IncidentLogForm({
  gates,
  disabled = false,
  onSubmit,
}: IncidentLogFormProps) {
  const [gateId, setGateId] = useState(() => gates[0]?.id ?? "");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">(
    "MEDIUM",
  );
  const [message, setMessage] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    setPending(true);
    try {
      await onSubmit({
        gateId,
        severity,
        message: message.trim(),
        occurredAt: occurredAt || undefined,
      });
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-base font-semibold text-gray-900">Incident Logging</p>
        <p className="mt-1 text-sm text-gray-500">
          Record check-in anomalies for audit and realtime incident broadcast.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-2">
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

        <label className="text-sm font-medium text-gray-900">
          Severity
          <Select
            className="mt-1"
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
            }
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </Select>
        </label>

        <label className="text-sm font-medium text-gray-900 lg:col-span-2">
          Occurred at
          <Input
            className="mt-1"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>

        <label className="text-sm font-medium text-gray-900 lg:col-span-2">
          Incident message
          <Textarea
            className="mt-1"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Duplicate wristband reported at Gate A."
            required
          />
        </label>

        <div className="lg:col-span-2">
          <Button type="submit" disabled={disabled || pending || gates.length === 0}>
            {pending ? "Logging..." : "Log incident"}
          </Button>
        </div>
      </form>
    </section>
  );
}
