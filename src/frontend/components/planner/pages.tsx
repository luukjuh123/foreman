"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  HardHat,
  Building2,
  Users,
  CircleCheck,
  MapPin,
  Clock3,
  List,
  ChartNoAxesGantt,
  Search,
  Package,
  ShieldCheck,
  TriangleAlert,
  Download,
  Wind,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { crews, day, daysBetween, Job, overlaps, today } from "@/lib/planner";
import { usePlanner } from "./provider";
import { JobEditor } from "./job-editor";
const dateLabel = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p className="page-description">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Status({ job }: { job: Job }) {
  return (
    <span
      className={`job-status status-${job.status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <i />
      {job.status}
    </span>
  );
}
function Empty() {
  return (
    <div className="empty-plan">
      <CalendarDays size={28} />
      <h3>Your next build starts here</h3>
      <p>Create a job to put your crew and schedule in motion.</p>
      <JobEditor />
    </div>
  );
}
function JobCard({ job, index }: { job: Job; index: number }) {
  return (
    <article className="job-card glass-panel">
      <div className={`job-art art-${index % 3}`}>
        <div className="blueprint-grid" />
        <Building2 className="building-drawing" strokeWidth={0.65} />
        <span className="art-label">{job.phase}</span>
        <span className="art-number">0{index + 1}</span>
        <Status job={job} />
      </div>
      <div className="job-card-body">
        <div className="job-card-title">
          <h3>
            <JobEditor job={job}>{job.name}</JobEditor>
          </h3>
          <ArrowUpRight size={17} />
        </div>
        <p className="site-location">
          <MapPin size={13} />
          {job.location || "Location to be confirmed"}
        </p>
        <div className="progress-caption">
          <span>{job.phase}</span>
          <strong>{job.progress}%</strong>
        </div>
        <div
          className="job-progress"
          role="progressbar"
          aria-label={`${job.name} progress`}
          aria-valuenow={job.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${job.progress}%` }} />
        </div>
        <div className="job-card-footer">
          <span>
            <span className="crew-avatar">
              {job.crew === "Unassigned" ? "—" : job.crew.slice(5, 6)}
            </span>
            {job.crew}
          </span>
          <span>
            <CalendarDays size={13} />
            {dateLabel(job.end)}
          </span>
        </div>
      </div>
    </article>
  );
}
export function Dashboard() {
  const { plan, ready } = usePlanner();
  const t = today();
  const active = plan.jobs.filter((j) => j.status !== "Complete");
  const working = plan.jobs.filter((j) => j.status === "In progress");
  const assigned = new Set(
    active.filter((j) => j.crew !== "Unassigned").map((j) => j.crew),
  ).size;
  const conflicts = plan.jobs.filter((j) =>
    plan.jobs.some((k) => overlaps(j, k)),
  );
  return (
    <>
      <Heading
        eyebrow="YOUR SITE. YOUR SCHEDULE."
        title="Let’s get building"
        description="The big picture, before the first toolbox opens."
      >
        <span className="date-chip">
          <CalendarDays size={15} />
          {dateLabel(t)}, {new Date().getFullYear()}
        </span>
        <JobEditor />
      </Heading>
      <section className="overview-grid">
        <div className="overview-welcome glass-panel">
          <div>
            <span className="section-tag">
              <span className="live-dot" /> THE PLAN AT A GLANCE
            </span>
            <h2>
              Good plans.
              <br />
              <span>Great builds.</span>
            </h2>
            <p>
              {active.length} jobs on the board. One place to keep
              <br className="desktop-break" /> your people, priorities, and next
              steps aligned.
            </p>
            <Link href="/jobs" className="text-action">
              Let’s look at the schedule <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-structure" aria-hidden="true">
            <div className="structure-floor floor-one" />
            <div className="structure-floor floor-two" />
            <div className="structure-floor floor-three" />
            <div className="structure-column column-one" />
            <div className="structure-column column-two" />
            <div className="structure-column column-three" />
            <div className="structure-column column-four" />
            <span className="structure-label">PLAN / BUILD / DELIVER</span>
          </div>
        </div>
        <article className="weather-card glass-panel">
          <div className="panel-title">
            <span>
              <MapPin size={14} />
              Utrecht, NL
            </span>
            <span className="sample-label">Sample forecast</span>
          </div>
          <div className="weather-main">
            <div>
              <strong>
                18<span>°</span>
              </strong>
              <p>Partly cloudy</p>
            </div>
            <CloudSun size={78} strokeWidth={1.2} />
          </div>
          <div className="weather-details">
            <span>
              <Wind size={14} />
              12 km/h
            </span>
            <span>
              <Droplets size={14} />
              20% rain
            </span>
          </div>
          <div className="weather-note">
            <span className="live-dot" />
            Planning preview · verify site conditions
          </div>
        </article>
      </section>
      <section className="kpi-grid" aria-label="Planning metrics">
        {[
          {
            name: "Active jobs",
            value: active.length,
            icon: Building2,
            note: `${working.length} in progress`,
            tone: "amber",
          },
          {
            name: "Crews assigned",
            value: assigned,
            icon: Users,
            note: `${3 - assigned} teams available`,
            tone: "blue",
          },
          {
            name: "Starting this week",
            value: active.filter((j) => j.start >= t && j.start <= day(t, 6))
              .length,
            icon: CalendarDays,
            note: "Next 7 days",
            tone: "violet",
          },
          {
            name: "Crew conflicts",
            value: conflicts.length,
            icon: conflicts.length ? TriangleAlert : CircleCheck,
            note: conflicts.length
              ? "Review overlapping assignments"
              : "Your schedule is clear",
            tone: "green",
          },
        ].map(({ name, value, icon: Icon, note, tone }) => (
          <article className="kpi-card glass-panel" key={name}>
            <div className="kpi-top">
              <span>{name}</span>
              <span className={`metric-icon ${tone}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong>{String(value).padStart(2, "0")}</strong>
            <p>
              <span className={`metric-dot ${tone}`} />
              {note}
            </p>
          </article>
        ))}
      </section>
      <div className="section-heading">
        <div>
          <h2>
            Active jobs <span>{active.length}</span>
          </h2>
          <p>A little progress, every day.</p>
        </div>
        <Link href="/jobs" className="muted-action">
          All jobs <ArrowRight size={15} />
        </Link>
      </div>
      {!ready ? (
        <p role="status">Loading your plan…</p>
      ) : active.length ? (
        <section className="job-cards">
          {active.slice(0, 3).map((job, i) => (
            <JobCard key={job.id} job={job} index={i} />
          ))}
        </section>
      ) : (
        <Empty />
      )}
      <section className="dashboard-bottom">
        <div className="glass-panel week-panel">
          <div className="section-heading">
            <div>
              <h2>Coming up next</h2>
              <p>The next moves on your schedule.</p>
            </div>
            <CalendarDays size={19} />
          </div>
          {active
            .slice()
            .sort((a, b) => a.start.localeCompare(b.start))
            .slice(0, 3)
            .map((j) => (
              <div className="upcoming-row" key={j.id}>
                <span className="upcoming-date">{dateLabel(j.start)}</span>
                <div>
                  <strong>{j.name}</strong>
                  <span>{j.phase}</span>
                </div>
                <span className="upcoming-crew">{j.crew}</span>
                <JobEditor job={j}>
                  <ArrowUpRight size={17} />
                  <span className="sr-only">Edit {j.name}</span>
                </JobEditor>
              </div>
            ))}
          {!active.length && <p>No upcoming jobs.</p>}
        </div>
        <div className="glass-panel field-note">
          <span className="section-tag">
            <HardHat size={16} /> ON THE SAME PAGE
          </span>
          <h3>
            A solid day starts
            <br />
            with a clear plan.
          </h3>
          <p>
            Review crew assignments before the morning briefing. Small check-ins
            keep big projects moving.
          </p>
          <Link href="/crew" className="text-action">
            Check your crew <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
export function Jobs() {
  const { plan, ready } = usePlanner();
  const [view, setView] = useState("gantt");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All jobs");
  const [start, setStart] = useState(today());
  const jobs = plan.jobs.filter(
    (j) =>
      `${j.name} ${j.location} ${j.crew}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "All jobs" || j.status === filter),
  );
  const days = Array.from({ length: 14 }, (_, i) => day(start, i));
  return (
    <>
      <Heading
        eyebrow="MAKE ROOM FOR WHAT’S NEXT"
        title="Jobs & planning"
        description="Line up the work. Give every crew a clear direction."
      >
        <JobEditor />
      </Heading>
      <div className="planning-toolbar">
        <div className="view-toggle" role="group" aria-label="Planning view">
          <button
            aria-pressed={view === "gantt"}
            onClick={() => setView("gantt")}
          >
            <ChartNoAxesGantt size={16} />
            Gantt
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} />
            List
          </button>
        </div>
        <label className="job-search">
          <Search size={16} />
          <input
            aria-label="Search jobs"
            placeholder="Search jobs, sites, crews…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All jobs", "In progress", "Scheduled", "On hold", "Complete"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </div>
      {!ready ? (
        <p role="status">Loading your plan…</p>
      ) : !plan.jobs.length ? (
        <Empty />
      ) : !jobs.length ? (
        <div className="empty-plan">
          <Search />
          <h3>No jobs match your filters</h3>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilter("All jobs");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : view === "gantt" ? (
        <section className="glass-panel gantt-panel">
          <div className="gantt-heading">
            <div>
              <h2>
                {dateLabel(start)} – {dateLabel(day(start, 13))}
              </h2>
              <p>14-day lookahead · select a job to reschedule</p>
            </div>
            <div className="calendar-controls">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous two weeks"
                onClick={() => setStart(day(start, -14))}
              >
                <ChevronLeft size={17} />
              </Button>
              <Button variant="outline" onClick={() => setStart(today())}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next two weeks"
                onClick={() => setStart(day(start, 14))}
              >
                <ChevronRight size={17} />
              </Button>
            </div>
          </div>
          <div
            className="gantt-scroll"
            tabIndex={0}
            role="region"
            aria-label="Job schedule, scroll horizontally"
          >
            <div className="gantt-grid">
              <div className="gantt-header">
                <strong>JOB / CREW</strong>
                {days.map((d) => (
                  <div key={d} className={d === today() ? "today-column" : ""}>
                    <span>
                      {new Date(d + "T12:00:00").toLocaleDateString("en-GB", {
                        weekday: "short",
                      })}
                    </span>
                    <b>{Number(d.slice(-2))}</b>
                  </div>
                ))}
              </div>
              {jobs.map((j) => {
                const left = Math.max(0, daysBetween(start, j.start)),
                  right = Math.min(13, daysBetween(start, j.end));
                const visible = left <= right;
                const conflict = plan.jobs.some((k) => overlaps(j, k));
                return (
                  <div className="gantt-row" key={j.id}>
                    <div className="gantt-job">
                      <JobEditor job={j}>{j.name}</JobEditor>
                      <span>
                        {conflict && <TriangleAlert size={12} />} {j.crew}
                        {conflict ? " · overlap" : ""}
                      </span>
                    </div>
                    <div className="gantt-track">
                      {days.map((d) => (
                        <div
                          key={d}
                          className={`gantt-cell ${d === today() ? "today-column" : ""} ${[0, 6].includes(new Date(d + "T12:00:00").getDay()) ? "weekend" : ""}`}
                        />
                      ))}
                      {visible && (
                        <div
                          className={`gantt-bar bar-${j.status.toLowerCase().replaceAll(" ", "-")}`}
                          style={{
                            left: `${(left / 14) * 100}%`,
                            width: `${((right - left + 1) / 14) * 100}%`,
                          }}
                        >
                          <JobEditor job={j}>
                            <span>
                              {j.phase} · {j.progress}%
                            </span>
                          </JobEditor>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="gantt-legend">
            <span>
              <i className="amber" />
              In progress
            </span>
            <span>
              <i className="blue" />
              Scheduled
            </span>
            <span>
              <i className="green" />
              Complete
            </span>
            <span>
              <i className="violet" />
              On hold
            </span>
          </div>
        </section>
      ) : (
        <div className="glass-panel job-list">
          {jobs.map((j) => (
            <article key={j.id}>
              <div>
                <JobEditor job={j}>{j.name}</JobEditor>
                <p>
                  <MapPin size={13} />
                  {j.location} · {j.phase}
                </p>
              </div>
              <Status job={j} />
              <span>{j.crew}</span>
              <span className="list-dates">
                {dateLabel(j.start)} – {dateLabel(j.end)}
              </span>
              <span>{j.progress}%</span>
            </article>
          ))}
        </div>
      )}
      <div className="planning-tip">
        <Clock3 size={16} />
        Dates and crew assignments update across your entire workspace. No
        integrations required.
      </div>
    </>
  );
}
export function Crew() {
  const { plan } = usePlanner();
  return (
    <>
      <Heading
        eyebrow="THE PEOPLE BEHIND THE PROGRESS"
        title="Your crew"
        description="Know who’s on site, what’s next, and where plans overlap."
      />
      <div className="crew-grid">
        {crews.slice(1).map((crew, i) => {
          const jobs = plan.jobs.filter(
            (j) => j.crew === crew && j.status !== "Complete",
          );
          const conflict = jobs.some((j) => jobs.some((k) => overlaps(j, k)));
          return (
            <article className="glass-panel crew-card" key={crew}>
              <span className={`team-icon team-${i}`}>
                <HardHat size={30} />
              </span>
              <h2>{crew}</h2>
              <p>
                {
                  [
                    "Structure & general construction",
                    "Interiors & finishing",
                    "Groundworks & site preparation",
                  ][i]
                }
              </p>
              <span
                className={`job-status ${conflict ? "status-on-hold" : "status-scheduled"}`}
              >
                {conflict
                  ? "Assignment overlap"
                  : `${jobs.length} planned jobs`}
              </span>
              <div className="crew-assignments">
                {jobs.map((j) => (
                  <div key={j.id}>
                    <JobEditor job={j}>{j.name}</JobEditor>
                    <span>
                      {dateLabel(j.start)} – {dateLabel(j.end)}
                    </span>
                  </div>
                ))}
                {!jobs.length && <p>Available for the next build.</p>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="glass-panel supporting-note">
        <Users />
        <div>
          <h3>Keep the team in sync</h3>
          <p>
            Assign a team when creating or editing a job. Overlapping dates are
            flagged automatically.
          </p>
        </div>
        <Link href="/jobs" className="text-action">
          Plan assignments <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
const materials = [
  {
    id: "timber",
    name: "Structural timber",
    detail: "C24 · 45 × 145 mm",
    quantity: "120 lengths",
    job: "Riverside residence",
    when: "Before framing",
  },
  {
    id: "plaster",
    name: "Plasterboard",
    detail: "12.5 mm · moisture resistant",
    quantity: "80 sheets",
    job: "The Foundry offices",
    when: "Before interior fit-out",
  },
  {
    id: "concrete",
    name: "Ready-mix concrete",
    detail: "C25/30 · foundation pour",
    quantity: "18 m³",
    job: "Parkside extension",
    when: "Before groundworks",
  },
];
export function Materials() {
  const { plan, update } = usePlanner();
  return (
    <>
      <Heading
        eyebrow="THE RIGHT MATERIALS. THE RIGHT TIME."
        title="Materials"
        description="A simple delivery checklist for the sample plan. Keep building while supplier tools are offline."
      />
      <div className="glass-panel checklist-panel">
        <div className="section-heading">
          <div>
            <h2>Site deliveries</h2>
            <p>
              {plan.delivered.length} of {materials.length} sample deliveries
              received
            </p>
          </div>
          <Package size={22} />
        </div>
        {materials.map((m) => (
          <label className="checklist-row" key={m.id}>
            <input
              type="checkbox"
              checked={plan.delivered.includes(m.id)}
              onChange={() =>
                update((p) => ({
                  ...p,
                  delivered: p.delivered.includes(m.id)
                    ? p.delivered.filter((id) => id !== m.id)
                    : [...p.delivered, m.id],
                }))
              }
            />
            <div>
              <strong>{m.name}</strong>
              <p>{m.detail}</p>
            </div>
            <span>{m.quantity}</span>
            <div className="delivery-job">
              <strong>{m.job}</strong>
              <p>
                {plan.delivered.includes(m.id) ? "Received on site" : m.when}
              </p>
            </div>
          </label>
        ))}
      </div>
      <div className="supporting-note glass-panel">
        <Package />
        <div>
          <h3>Supplier tools are an optional extra</h3>
          <p>
            Material search, prices, and shopping lists are available in the
            existing connected tools.
          </p>
        </div>
        <Link className="text-action" href="/dashboard/materials">
          Supplier tools <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}
const checks = [
  {
    id: "briefing",
    name: "Morning safety briefing",
    detail: "Review today’s activities and site-specific risks.",
  },
  {
    id: "ppe",
    name: "Personal protective equipment",
    detail:
      "Check helmets, boots, eye protection, and high-visibility clothing.",
  },
  {
    id: "access",
    name: "Clear access & emergency routes",
    detail: "Keep exits, walkways, and emergency access unobstructed.",
  },
  {
    id: "equipment",
    name: "Tools & equipment inspection",
    detail: "Check equipment condition before work begins.",
  },
  {
    id: "weather",
    name: "Weather & working conditions",
    detail: "Verify local conditions before outdoor or elevated work.",
  },
];
export function Safety() {
  const { plan, update } = usePlanner();
  const prefix = today() + ":";
  const count = checks.filter((c) =>
    plan.checks.includes(prefix + c.id),
  ).length;
  return (
    <>
      <Heading
        eyebrow="EVERYONE HOME SAFE"
        title="Safety first"
        description="A daily site checklist to support your morning briefing."
      />
      <div className="safety-summary glass-panel">
        <ShieldCheck size={40} />
        <div>
          <h2>
            {count} of {checks.length} checks complete
          </h2>
          <p>{dateLabel(today())} · Checks reset each day</p>
        </div>
        <span className="job-status status-scheduled">
          {count === checks.length
            ? "Briefing checklist complete"
            : "Review before work"}
        </span>
      </div>
      <div className="glass-panel checklist-panel">
        {checks.map((c) => (
          <label className="checklist-row" key={c.id}>
            <input
              type="checkbox"
              checked={plan.checks.includes(prefix + c.id)}
              onChange={() =>
                update((p) => ({
                  ...p,
                  checks: p.checks.includes(prefix + c.id)
                    ? p.checks.filter((id) => id !== prefix + c.id)
                    : [...p.checks, prefix + c.id],
                }))
              }
            />
            <div>
              <strong>{c.name}</strong>
              <p>{c.detail}</p>
            </div>
          </label>
        ))}
      </div>
      <p className="planning-tip">
        Use alongside your site’s risk assessment and required safety
        procedures.
      </p>
    </>
  );
}
export function Settings() {
  const { plan, update, ready } = usePlanner();
  const [saved, setSaved] = useState(false);
  function download() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
    );
    a.href = url;
    a.download = `foreman-plan-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Heading
        eyebrow="A WORKSPACE THAT WORKS FOR YOU"
        title="Settings"
        description="Your workspace, your plan. Keep the essentials close."
      />
      <div className="settings-grid">
        <section className="glass-panel settings-panel">
          <h2>Workspace</h2>
          <p>Saved in this browser, available without an account.</p>
          <form
            key={String(ready)}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const company = String(data.get("company")).trim();
              if (!company) return;
              update((p) => ({ ...p, company }));
              setSaved(true);
            }}
          >
            <label>
              Company name
              <input
                name="company"
                required
                maxLength={80}
                defaultValue={plan.company}
              />
            </label>
            <Button disabled={!ready} type="submit">
              Save workspace
            </Button>
            {saved && (
              <span role="status" className="saved-message">
                Workspace updated
              </span>
            )}
          </form>
          <hr />
          <h3>Your planning data</h3>
          <p>
            This sample workspace stores edits on this device. It does not sync
            to the server or other devices. Export a backup before clearing
            browser data.
          </p>
          <Button disabled={!ready} variant="outline" onClick={download}>
            <Download size={16} />
            Export plan as JSON
          </Button>
        </section>
        <section className="glass-panel settings-panel">
          <h2>Connected tools</h2>
          <p>
            Existing tools are available when you need them. They may require an
            account and a backend connection.
          </p>
          {[
            { name: "Business overview", href: "/dashboard/overview" },
            { name: "Projects & AI planning", href: "/dashboard/projects" },
            { name: "Customers & quotes", href: "/dashboard/customers" },
            { name: "Financials & invoices", href: "/dashboard/financials" },
            { name: "Staff administration", href: "/dashboard/staff" },
            { name: "Reports & analytics", href: "/dashboard/reports" },
          ].map((l) => (
            <Link className="settings-link" href={l.href} key={l.href}>
              {l.name}
              <ArrowUpRight size={17} />
            </Link>
          ))}
          <div className="settings-footnote">
            <ShieldCheck size={17} />
            Optional services never block your local plan.
          </div>
        </section>
      </div>
    </>
  );
}
