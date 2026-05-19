"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, TrendingUp, Wallet } from "lucide-react";

const FINANCIALS_ITEMS = [
  {
    label: "Balans",
    description: "Overzicht van activa, passiva en eigen vermogen",
    href: "/dashboard/financials/balance-sheet",
    icon: Scale,
  },
  {
    label: "Winst & Verlies",
    description: "Inkomsten en uitgaven over een periode",
    href: "/dashboard/financials/income-statement",
    icon: TrendingUp,
  },
  {
    label: "Kasstroom",
    description: "Geldstromen uit operationele, investerings- en financieringsactiviteiten",
    href: "/dashboard/financials/cash-flow",
    icon: Wallet,
  },
];

export default function FinancialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Boekhouding</h1>
        <p className="text-muted-foreground mt-1">
          Financiële rapporten en overzichten
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FINANCIALS_ITEMS.map(({ label, description, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
