import { Suspense } from "react";
import AgendaDayContent from "./agenda-day-content";

export default function AgendaDayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Laden...</p>}>
      <AgendaDayContent />
    </Suspense>
  );
}
