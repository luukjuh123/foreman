"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Mail, Phone, FileText, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerResponse, CustomerSummaryResponse } from "@/lib/customers";
import { getCustomer, getCustomerSummary, formatEuroCents } from "@/lib/customers";

// ---------------------------------------------------------------------------
// Invoice status badge
// ---------------------------------------------------------------------------

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    draft: "Concept",
    sent: "Verzonden",
    paid: "Betaald",
    overdue: "Verlopen",
    cancelled: "Geannuleerd",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", map[status] ?? "bg-gray-100 text-gray-600")}>
      {labels[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Project status badge
// ---------------------------------------------------------------------------

function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    archived: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    draft: "Concept",
    active: "Actief",
    completed: "Afgerond",
    archived: "Gearchiveerd",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", map[status] ?? "bg-gray-100 text-gray-600")}>
      {labels[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [summary, setSummary] = useState<CustomerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([getCustomer(id), getCustomerSummary(id)])
      .then(([c, s]) => {
        setCustomer(c);
        setSummary(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error || !customer || !summary) {
    return <p className="text-sm text-destructive">{error ?? "Klant niet gevonden."}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/customers">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
      </div>

      {/* Contact card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Contactgegevens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Email */}
            {customer.email && (
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <a href={`mailto:${customer.email}`} className="text-sm hover:underline">
                    {customer.email}
                  </a>
                </div>
              </div>
            )}

            {/* Phone */}
            {customer.phone && (
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Telefoon</p>
                  <a href={`tel:${customer.phone}`} className="text-sm hover:underline">
                    {customer.phone}
                  </a>
                </div>
              </div>
            )}

            {/* Address */}
            {(customer.address_line1 || customer.city) && (
              <div>
                <p className="text-xs text-muted-foreground">Adres</p>
                <div className="text-sm">
                  {customer.address_line1 && <div>{customer.address_line1}</div>}
                  {customer.address_line2 && <div>{customer.address_line2}</div>}
                  {(customer.postal_code || customer.city) && (
                    <div>
                      {[customer.postal_code, customer.city].filter(Boolean).join(" ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* KVK */}
            {customer.kvk_number && (
              <div>
                <p className="text-xs text-muted-foreground">KVK-nummer</p>
                <p className="text-sm font-mono">{customer.kvk_number}</p>
              </div>
            )}

            {/* BTW */}
            {customer.vat_number && (
              <div>
                <p className="text-xs text-muted-foreground">BTW-nummer</p>
                <p className="text-sm font-mono">{customer.vat_number}</p>
              </div>
            )}

            {/* Outstanding */}
            <div>
              <p className="text-xs text-muted-foreground">Openstaand bedrag</p>
              <p className={cn("text-sm font-semibold", summary.outstanding_cents > 0 ? "text-amber-600" : "text-green-600")}>
                {formatEuroCents(summary.outstanding_cents)}
              </p>
            </div>
          </div>

          {/* Notes */}
          {customer.notes && (
            <div className="mt-4 rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Notities</p>
              <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4" />
            Projecten ({summary.projects.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.projects.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Geen projecten gekoppeld.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Start</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Einde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.projects.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/projects/${p.id}`}
                          className="hover:underline text-foreground"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ProjectStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.start_date ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.end_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Facturen ({summary.invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.invoices.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Geen facturen gevonden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Factuurnr.</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vervaldatum</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Bedrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="hover:underline text-foreground font-mono"
                        >
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.issue_date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.due_date}</td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatEuroCents(inv.total_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
