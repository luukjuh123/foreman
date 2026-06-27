import Link from "next/link";
import { HardHat } from "lucide-react";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Projectbeheer", href: "#" },
      { label: "Offertes", href: "#" },
      { label: "Facturatie", href: "#" },
      { label: "AI Planning", href: "#" },
      { label: "Agenda", href: "#" },
      { label: "Materialen", href: "#" },
    ],
  },
  {
    heading: "Bedrijf",
    links: [
      { label: "Over ons", href: "#" },
      { label: "Prijzen", href: "/pricing" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Vacatures", href: "#" },
    ],
  },
  {
    heading: "Juridisch",
    links: [
      { label: "Algemene voorwaarden", href: "#" },
      { label: "Privacybeleid", href: "#" },
      { label: "Cookie beleid", href: "#" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-card">
      {/* Main grid */}
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25">
                <HardHat className="h-4.5 w-4.5" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-foreground">
                Foreman
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
              Het complete platform voor Nederlandse bouwbedrijven.
            </p>
            <p className="text-xs text-muted-foreground/50">
              &copy; {year} Foreman B.V.
              <br />
              KvK 12345678
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading} className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                {col.heading}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/30">
        <div className="mx-auto max-w-6xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/50 order-2 sm:order-1">
            &copy; {year} Foreman B.V. — Alle rechten voorbehouden.
          </p>
          {/* Social placeholders */}
          <div className="flex items-center gap-3 order-1 sm:order-2">
            {["LinkedIn", "X", "GitHub"].map((name) => (
              <Link
                key={name}
                href="#"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-[10px] font-bold text-muted-foreground/50 hover:border-border hover:text-muted-foreground transition-colors"
                aria-label={name}
              >
                {name[0]}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
