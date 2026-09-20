"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "framer-motion";
import {
  LayoutDashboard,
  CalendarRange,
  Users,
  Package,
  ShieldCheck,
  Settings,
  HardHat,
  ArrowUpRight,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { usePlanner } from "./provider";
import PwaRegister from "@/components/pwa-register";
const links = [
  { href: "/dashboard", name: "Overview", icon: LayoutDashboard },
  { href: "/jobs", name: "Jobs & planning", icon: CalendarRange },
  { href: "/crew", name: "Crew", icon: Users },
  { href: "/materials", name: "Materials", icon: Package },
  { href: "/safety", name: "Safety", icon: ShieldCheck },
  { href: "/settings", name: "Settings", icon: Settings },
];
export function PlannerShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { plan, message } = usePlanner();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className="planner">
        <a href="#planning-content" className="skip-link">
          Skip to content
        </a>
        <aside className="planner-sidebar">
          <Link className="planner-brand" href="/dashboard">
            <span className="brand-mark">
              <HardHat size={24} />
            </span>
            foreman<span className="brand-dot">.</span>
          </Link>
          <div className="workspace-tag">
            <span className="workspace-avatar">N</span>
            <div>
              <strong>{plan.company}</strong>
              <small>Planning workspace</small>
            </div>
          </div>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="Main navigation">
            {links.map(({ href, name, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={path === href ? "nav-item active" : "nav-item"}
              >
                <Icon size={19} />
                <span>{name}</span>
                {href === "/jobs" && <small>{plan.jobs.length}</small>}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="site-note">
              <span className="live-dot" /> Built for the job site
              <p>A clear plan. A better build.</p>
            </div>
            <div className="profile">
              <span className="workspace-avatar">NC</span>
              <div>
                <strong>Workspace planner</strong>
                <small>Local workspace</small>
              </div>
              <Link href="/settings" aria-label="Workspace settings">
                <Settings size={18} />
              </Link>
            </div>
          </div>
        </aside>
        <div className="planner-main">
          <header className="planner-topbar">
            <span className="topbar-breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>{links.find((l) => l.href === path)?.name}</strong>
            </span>
            <span className="local-label">
              <span className="live-dot" />
              {offline
                ? "Offline · planning available"
                : "Local-first workspace"}
            </span>
            <Link href="/jobs" className="topbar-link">
              Open schedule <ArrowUpRight size={15} />
            </Link>
          </header>
          <PwaRegister />
          {offline && (
            <div className="planner-notice">
              <WifiOff size={16} />
              You’re offline. You can keep editing your saved plan.
            </div>
          )}
          {message && (
            <div role="status" className="planner-notice">
              {message}
            </div>
          )}
          <motion.main
            id="planning-content"
            key={path}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.main>
          <footer className="planner-footer">
            <span>FOREMAN / BUILD WITH CLARITY</span>
            <span>Sample workspace · changes saved on this device</span>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
