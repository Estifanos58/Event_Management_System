"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TicketActionsProps = {
  eventId: string;
  ticketId: string;
  ticketStatus: string;
};

type ApiErrorShape = {
  error?: string;
  message?: string;
};

const transferSchema = z.object({
  toUserEmail: z.string().email("Enter a valid target email address."),
  expiresInHours: z.number().int().min(1).max(72),
  reason: z.string().trim().max(240).optional(),
});

const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, "Cancellation reason must contain at least 4 characters.")
    .max(240),
});

type TransferValues = z.infer<typeof transferSchema>;
type CancelValues = z.infer<typeof cancelSchema>;

function parseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const casted = payload as ApiErrorShape;
  return casted.error ?? casted.message ?? fallback;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Request failed."));
  }

  return payload;
}

export function TicketActions({ eventId, ticketId, ticketStatus }: TicketActionsProps) {
  const transferForm = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      toUserEmail: "",
      expiresInHours: 24,
      reason: "",
    },
  });

  const cancelForm = useForm<CancelValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: {
      reason: "",
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferValues) => {
      return postJson(`/api/events/${eventId}/tickets/${ticketId}/transfer`, {
        toUserEmail: values.toUserEmail,
        expiresInHours: values.expiresInHours,
        reason: values.reason || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Transfer request created.");
      transferForm.reset({
        toUserEmail: "",
        expiresInHours: 24,
        reason: "",
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create transfer request.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (values: CancelValues) => {
      return postJson(`/api/events/${eventId}/tickets/${ticketId}/cancel`, {
        reason: values.reason,
      });
    },
    onSuccess: () => {
      toast.success("Ticket cancellation request submitted.");
      cancelForm.reset({ reason: "" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to cancel ticket.");
    },
  });

  const isActionDisabled = ticketStatus !== "VALID";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Transfer Ticket</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create a transfer request for another user. Ticket status must be VALID.
        </p>

        <form className="mt-4 space-y-3" onSubmit={transferForm.handleSubmit((values) => transferMutation.mutate(values))}>
          <label className="block text-sm font-medium text-gray-900">
            Recipient email
            <Input className="mt-1" type="email" {...transferForm.register("toUserEmail")} />
            {transferForm.formState.errors.toUserEmail ? (
              <p className="mt-1 text-xs text-red-600">
                {transferForm.formState.errors.toUserEmail.message}
              </p>
            ) : null}
          </label>

          <label className="block text-sm font-medium text-gray-900">
            Expires in hours
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={72}
              {...transferForm.register("expiresInHours", { valueAsNumber: true })}
            />
            {transferForm.formState.errors.expiresInHours ? (
              <p className="mt-1 text-xs text-red-600">
                {transferForm.formState.errors.expiresInHours.message}
              </p>
            ) : null}
          </label>

          <label className="block text-sm font-medium text-gray-900">
            Reason (optional)
            <Textarea className="mt-1" rows={3} {...transferForm.register("reason")} />
          </label>

          <Button type="submit" disabled={isActionDisabled || transferMutation.isPending}>
            {transferMutation.isPending ? "Requesting transfer..." : "Request transfer"}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">Cancel Ticket</h3>
        <p className="mt-1 text-sm text-gray-500">
          Cancel this ticket when refund or transfer is not possible.
        </p>

        <form className="mt-4 space-y-3" onSubmit={cancelForm.handleSubmit((values) => cancelMutation.mutate(values))}>
          <label className="block text-sm font-medium text-gray-900">
            Cancellation reason
            <Textarea className="mt-1" rows={4} {...cancelForm.register("reason")} />
            {cancelForm.formState.errors.reason ? (
              <p className="mt-1 text-xs text-red-600">
                {cancelForm.formState.errors.reason.message}
              </p>
            ) : null}
          </label>

          <Button type="submit" variant="secondary" disabled={isActionDisabled || cancelMutation.isPending}>
            {cancelMutation.isPending ? "Submitting cancellation..." : "Cancel ticket"}
          </Button>

          {isActionDisabled ? (
            <p className="text-xs text-gray-500">
              Ticket actions are disabled for status: {ticketStatus}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
