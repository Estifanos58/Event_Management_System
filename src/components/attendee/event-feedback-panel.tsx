"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import type { DiscoveryEventFeedbackState } from "@/domains/discovery/types";

type EventFeedbackPanelProps = {
  eventId: string;
  initialState: DiscoveryEventFeedbackState;
};

type ApiResponse<T> = {
  result?: T;
};

type FeedbackSubmitPayload = {
  rating: number;
  reviewText: string;
};

type ApiErrorShape = {
  error?: string;
  message?: string;
};

const FEEDBACK_QUERY_KEY = "event-feedback";

function parseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const casted = payload as ApiErrorShape;
  return casted.error ?? casted.message ?? fallback;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderStars(value: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const starValue = index + 1;
    const filled = starValue <= value;

    return (
      <Star
        key={`star:${starValue}`}
        className={cn(
          "h-4 w-4",
          filled ? "fill-orange-500 text-orange-500" : "text-gray-300",
        )}
      />
    );
  });
}

async function getEventFeedbackState(eventId: string, page: number, pageSize: number) {
  const response = await fetch(
    `/api/discovery/events/${eventId}/feedback?page=${page}&pageSize=${pageSize}`,
    {
    method: "GET",
    cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Failed to load attendee feedback."));
  }

  const result = (payload as ApiResponse<DiscoveryEventFeedbackState>)?.result;

  if (!result) {
    throw new Error("Feedback response is invalid.");
  }

  return result;
}

async function postEventFeedback(eventId: string, input: FeedbackSubmitPayload) {
  const response = await fetch(`/api/discovery/events/${eventId}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Failed to save feedback."));
  }
}

async function deleteEventFeedback(eventId: string) {
  const response = await fetch(`/api/discovery/events/${eventId}/feedback`, {
    method: "DELETE",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseError(payload, "Failed to delete feedback."));
  }
}

export function EventFeedbackPanel({ eventId, initialState }: EventFeedbackPanelProps) {
  const router = useRouter();
  const [page, setPage] = useState(initialState.entryPagination.page);
  const [pageSize] = useState(initialState.entryPagination.pageSize);

  const [rating, setRating] = useState(initialState.viewerFeedback?.rating ?? 0);
  const [reviewText, setReviewText] = useState(initialState.viewerFeedback?.reviewText ?? "");

  const feedbackQuery = useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, eventId, page, pageSize],
    queryFn: () => getEventFeedbackState(eventId, page, pageSize),
    initialData: page === initialState.entryPagination.page ? initialState : undefined,
    placeholderData: (previousData) => previousData,
  });

  const feedbackState = feedbackQuery.data ?? initialState;
  const viewerFeedback = feedbackState.viewerFeedback;
  const canSubmitFeedback = feedbackState.feedbackEligibility.eligible;

  function syncDraftFromState(nextState: DiscoveryEventFeedbackState) {
    setRating(nextState.viewerFeedback?.rating ?? 0);
    setReviewText(nextState.viewerFeedback?.reviewText ?? "");
  }

  const submitMutation = useMutation({
    mutationFn: async (payload: FeedbackSubmitPayload) => postEventFeedback(eventId, payload),
    onSuccess: async () => {
      toast.success("Feedback saved.");

      const refreshed = await feedbackQuery.refetch();
      if (refreshed.data) {
        setPage(refreshed.data.entryPagination.page);
        syncDraftFromState(refreshed.data);
      }

      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save feedback.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => deleteEventFeedback(eventId),
    onSuccess: async () => {
      toast.success("Your feedback was removed.");

      const refreshed = await feedbackQuery.refetch();
      if (refreshed.data) {
        setPage(refreshed.data.entryPagination.page);
        syncDraftFromState(refreshed.data);
      }

      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete feedback.");
    },
  });

  const isPending = submitMutation.isPending || deleteMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmitFeedback) {
      toast.error(feedbackState.feedbackEligibility.reason);
      return;
    }

    const trimmedReviewText = reviewText.trim();

    if (rating < 1 || rating > 5) {
      toast.error("Select a star rating before submitting.");
      return;
    }

    if (trimmedReviewText.length < 2) {
      toast.error("Please write a comment before submitting.");
      return;
    }

    submitMutation.mutate({
      rating,
      reviewText: trimmedReviewText,
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Attendee Feedback</h2>
          <p className="mt-2 text-sm text-gray-500">
            {feedbackState.feedbackSummary.ratingCount === 0
              ? "No feedback has been submitted for this event yet."
              : `${feedbackState.feedbackSummary.ratingCount} ratings with an average of ${feedbackState.feedbackSummary.ratingAverage.toFixed(1)}.`}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-right">
          <p className="flex items-center justify-end gap-1 text-sm font-semibold text-gray-900">
            {renderStars(Math.round(feedbackState.feedbackSummary.ratingAverage))}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {feedbackState.feedbackSummary.ratingAverage.toFixed(1)} / 5
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-900">Your feedback</p>
        <p className="mt-1 text-xs text-gray-500">{feedbackState.feedbackEligibility.reason}</p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Star rating</p>
            <div className="mt-2 flex items-center gap-1">
              {Array.from({ length: 5 }, (_, index) => {
                const starValue = index + 1;
                const filled = starValue <= rating;

                return (
                  <button
                    key={`selector:${starValue}`}
                    type="button"
                    className="rounded-md p-1 transition-colors hover:bg-orange-50"
                    onClick={() => setRating(starValue)}
                    disabled={!canSubmitFeedback || isPending}
                    aria-label={`Rate ${starValue} stars`}
                  >
                    <Star
                      className={cn(
                        "h-5 w-5",
                        filled ? "fill-orange-500 text-orange-500" : "text-gray-300",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-900">
            Comment
            <Textarea
              className="mt-1"
              rows={4}
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              placeholder="Share your experience with this event."
              disabled={!canSubmitFeedback || isPending}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!canSubmitFeedback || isPending}>
              {submitMutation.isPending
                ? "Saving..."
                : viewerFeedback
                  ? "Update feedback"
                  : "Submit feedback"}
            </Button>

            {viewerFeedback ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => deleteMutation.mutate()}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete my feedback"}
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">
          Recent comments
        </h3>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>
            Page {feedbackState.entryPagination.page} of {feedbackState.entryPagination.totalPages} -
            {" "}
            {feedbackState.entryPagination.total} comments
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={feedbackState.entryPagination.page <= 1 || feedbackQuery.isFetching}
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={
                feedbackState.entryPagination.page >= feedbackState.entryPagination.totalPages ||
                feedbackQuery.isFetching
              }
              onClick={() =>
                setPage((previous) =>
                  Math.min(feedbackState.entryPagination.totalPages, previous + 1),
                )
              }
            >
              Next
            </Button>
          </div>
        </div>

        {feedbackQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading feedback...</p>
        ) : feedbackState.entries.length === 0 ? (
          <p className="text-sm text-gray-500">No comments yet.</p>
        ) : (
          feedbackState.entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{entry.userName}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(entry.createdAt)}</p>
                </div>

                <div className="flex items-center gap-1">{renderStars(entry.rating)}</div>
              </div>

              <p className="mt-3 text-sm text-gray-600">
                {entry.reviewText?.trim() ? entry.reviewText : "No written comment provided."}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
