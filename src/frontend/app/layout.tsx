import type { Metadata, Viewport } from "next";
import { PlannerProvider } from "@/components/planner/provider";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "Foreman — Construction planning",
  description:
    "Plan jobs, coordinate your crew, and keep every build on track.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <PlannerProvider>{children}</PlannerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
