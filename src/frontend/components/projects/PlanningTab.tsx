"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart2 } from "lucide-react";

interface PlanningTabProps {
  projectId: string;
}

export function PlanningTab({ projectId }: PlanningTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/projects/${projectId}/gantt`}>
          <Button variant="outline" size="sm">
            <BarChart2 className="mr-1.5 h-4 w-4" />
            Gantt openen
          </Button>
        </Link>
        <Link href={`/dashboard/projects/${projectId}/board`}>
          <Button variant="outline" size="sm">Takenbord openen</Button>
        </Link>
      </div>
      <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Gebruik de Gantt-weergave voor de volledige interactieve planning.
      </div>
    </div>
  );
}
