"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { InvoiceResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers (reused from detail page via inline — no cross-import to page)
// ---------------------------------------------------------------------------

function formatMoneyCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InvoiceSendDialogProps {
  invoice: InvoiceResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (updated: InvoiceResponse) => void;
  customerEmail: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceSendDialog({
  invoice,
  open,
  onOpenChange,
  onSent,
  customerEmail,
}: InvoiceSendDialogProps) {
  const [email, setEmail] = useState(customerEmail ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setEmail(customerEmail ?? "");
      setError(null);
    }
  }, [open, customerEmail]);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceResponse>(
        `/invoices/${invoice.id}/transition`,
        {
          method: "POST",
          body: JSON.stringify({ status: "sent" }),
        }
      );
      onSent(updated);
      onOpenChange(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg"
          aria-describedby="send-dialog-description"
        >
          <Dialog.Title className="text-lg font-semibold">
            Factuur versturen
          </Dialog.Title>
          <p id="send-dialog-description" className="mt-1 text-sm text-muted-foreground">
            Verstuur factuur <strong>{invoice.invoice_number}</strong> per e-mail.
          </p>

          {/* Invoice summary */}
          <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factuurnummer</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Totaalbedrag</span>
              <span className="font-medium">{formatMoneyCents(invoice.total_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vervaldatum</span>
              <span className="font-medium">{formatDate(invoice.due_date)}</span>
            </div>
          </div>

          {/* Email field */}
          <div className="mt-4 space-y-1">
            <label htmlFor="send-email" className="text-sm font-medium">
              E-mailadres ontvanger
            </label>
            <Input
              id="send-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@voorbeeld.nl"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm" disabled={sending}>
                Annuleren
              </Button>
            </Dialog.Close>
            <Button size="sm" disabled={sending} onClick={handleSend}>
              Versturen
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
