"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Construction } from "lucide-react";

export default function NewQuotePage() {
  return (
    <div className="space-y-6">
      <Link href="/dashboard/quotes">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Offertes
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nieuwe offerte</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Maak een nieuwe offerte aan voor een klant
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Construction className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Offerte formulier</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Het offerte aanmaakformulier wordt hier weergegeven. Selecteer een klant, voeg regelitems toe met BTW-tarieven en stel de geldigheidsperiode in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
