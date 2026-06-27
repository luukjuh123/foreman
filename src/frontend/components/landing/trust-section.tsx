import { Shield, Lock, Server } from "lucide-react";

const COMPANY_LOGOS = [
  "Van der Berg Bouw",
  "Jansen & Zn. Aannemers",
  "Bouwgroep Almere",
  "De Vries Constructie",
  "Kwaliteitsbouw BV",
  "Renovatie Experts NL",
];

const TRUST_BADGES = [
  {
    icon: Shield,
    label: "SSL Beveiligd",
    description: "256-bit encryptie",
  },
  {
    icon: Lock,
    label: "AVG Compliant",
    description: "Privacywetgeving naleefd",
  },
  {
    icon: Server,
    label: "Nederlandse Servers",
    description: "Data blijft in Nederland",
  },
];

export function TrustSection() {
  return (
    <section className="border-y border-border/40 bg-muted/10 py-16">
      <div className="mx-auto max-w-6xl px-6 space-y-12">
        {/* Section title */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-4">
            Vertrouwd door
          </p>
          <h2 className="text-xl font-bold text-foreground">
            Vertrouwd door bouwbedrijven in heel Nederland
          </h2>
        </div>

        {/* Company logos row */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {COMPANY_LOGOS.map((name) => (
            <div
              key={name}
              className="rounded-lg border border-border/40 bg-card/50 px-5 py-2.5"
            >
              <span className="text-sm font-semibold text-muted-foreground/60 whitespace-nowrap">
                {name}
              </span>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {TRUST_BADGES.map(({ icon: Icon, label, description }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-6 py-4 flex-1 max-w-xs"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
