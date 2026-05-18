import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, CheckSquare, FileText, Users } from "lucide-react";

const STAT_CARDS = [
  {
    title: "Actieve Projecten",
    value: "0",
    icon: FolderKanban,
  },
  {
    title: "Taken Vandaag",
    value: "0",
    icon: CheckSquare,
  },
  {
    title: "Openstaande Facturen",
    value: "€0,00",
    icon: FileText,
  },
  {
    title: "Personeel Actief",
    value: "0",
    icon: Users,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welkom bij Foreman</h1>
        <p className="text-muted-foreground mt-1">
          Overzicht van uw constructiebedrijf
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ title, value, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recente Activiteit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aankomende Taken</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Geen aankomende taken.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
