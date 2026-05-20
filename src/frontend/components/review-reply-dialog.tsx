"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { fetchDraftReply, submitReply } from "@/lib/reviews";
import type { ReviewResponse } from "@/lib/reviews";

interface ReviewReplyDialogProps {
  /** The review to reply to. */
  review: ReviewResponse;
  /** Called after a successful reply is submitted. */
  onSuccess?: (updated: ReviewResponse) => void;
  /** Trigger element — defaults to a "Reageren" button. */
  trigger?: React.ReactNode;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} van 5 sterren`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < rating ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function ReviewReplyDialog({
  review,
  onSuccess,
  trigger,
}: ReviewReplyDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [replyText, setReplyText] = React.useState(review.reply_text ?? "");
  const [draftLoading, setDraftLoading] = React.useState(false);
  const [submitLoading, setSubmitLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleAiDraft() {
    setDraftLoading(true);
    setError(null);
    try {
      const { draft_text } = await fetchDraftReply(review.id);
      setReplyText(draft_text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI concept ophalen mislukt");
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSubmitLoading(true);
    setError(null);
    try {
      const updated = await submitReply(review.id, replyText.trim());
      setSuccess(true);
      onSuccess?.(updated);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Reageren
          </Button>
        )}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
        >
          <Dialog.Title className="mb-4 text-lg font-semibold">
            Reageren op recensie
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Schrijf en verstuur een reactie op de Google-recensie van {review.author_name}.
          </Dialog.Description>

          {/* Original review */}
          <div className="mb-4 rounded-md border bg-gray-50 p-3 dark:bg-gray-800">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium">{review.author_name}</span>
              <StarRating rating={review.rating} />
            </div>
            {review.comment && (
              <p className="text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            {/* AI draft button */}
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="reply-textarea"
                className="text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Uw antwoord
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAiDraft}
                disabled={draftLoading}
                aria-label="AI concept genereren"
              >
                {draftLoading ? "Laden…" : "✨ AI Concept"}
              </Button>
            </div>

            <textarea
              id="reply-textarea"
              className="w-full rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              rows={6}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Schrijf uw reactie…"
              required
            />

            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="mt-2 text-sm text-green-600">
                Reactie verstuurd!
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Annuleren
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={submitLoading || !replyText.trim()}>
                {submitLoading ? "Versturen…" : "Versturen"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
