"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBtwCents, type BtwAangifteResponse } from "@/lib/btw";

interface Props {
  aangifte: BtwAangifteResponse;
  onUpdate?: () => void;
}

const BOX_ROWS = [
  { key: "box_1a_net_cents", label: "1a — Hoog tarief (21%) — netto", indent: false },
  { key: "box_1b_net_cents", label: "1b — Laag tarief (9%) — netto", indent: false },
  { key: "box_1c_net_cents", label: "1c — Nul-tarief (0%) — netto", indent: false },
  { key: "box_5a_vat_due_cents", label: "5a — Totaal BTW verschuldigd", indent: false },
  { key: "box_5b_voorbelasting_cents", label: "5b — Totaal voorbelasting", indent: false },
  { key: "box_5d_payable_cents", label: "5d — Te betalen / terug te ontvangen", indent: false },
] as const;

export default function BtwAangifteDetail({ aangifte, onUpdate }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">BTW Aangifte details</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {BOX_ROWS.map(({ key, label }) => (
              <tr key={key} className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">{label}</td>
                <td className="py-2 text-right font-mono">
                  {formatBtwCents(aangifte[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {aangifte.notes && (
          <p className="mt-4 text-sm text-muted-foreground">{aangifte.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
