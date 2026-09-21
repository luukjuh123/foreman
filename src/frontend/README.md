# Foreman planning workspace

The default frontend is a planning-first Next.js 16 App Router workspace using React 19, Tailwind CSS v4, existing shadcn/ui primitives, and Framer Motion. It uses a zinc/amber palette, translucent cards, reduced-motion support, and mobile bottom navigation.

```sh
npm ci
npm run dev
npm run lint
npm run type-check
npm test
npm run build
```

Use Node.js 22 or newer. Production builds use Next.js standalone output; the existing Dockerfile packages the standalone server and public assets.

| Route | Purpose |
| --- | --- |
| `/dashboard` | Sample weather, derived planning metrics, active jobs, and upcoming work |
| `/jobs` | Searchable and filterable list/Gantt views; create, edit, reschedule, assign crews, track progress, and delete jobs |
| `/crew` | Team assignments and overlapping date warnings |
| `/materials` | Persistent sample delivery checklist and optional supplier tools |
| `/safety` | Date-specific site checklist |
| `/settings` | Workspace name, JSON backup export, and links to connected business tools |

The root redirects to `/dashboard`. Existing connected tools remain under `/dashboard/*`, with the previous dashboard at `/dashboard/overview`. Their authentication and backend requirements do not gate the new planner.

## Data and offline behavior

The workspace starts with clearly labeled sample jobs, teams, materials, and weather. Weather is illustrative, not a live forecast. Planner edits are stored under `foreman-planner-v1` in this browser's localStorage. They are **not** synchronized to the backend or shared across devices. Export a JSON backup in Settings before clearing browser data. Import and server synchronization are future work.

The service worker precaches public planning pages and their versioned assets. After an initial online visit, cached pages can reload offline and job edits remain local. It never caches API responses or authenticated business pages. A fallback page explains when a route has not yet been cached. Installation requires HTTPS (or localhost); 192px and 512px icons and a web manifest are included.

Crew conflicts use inclusive date ranges and exclude completed jobs and unassigned crews. Warnings do not prevent an intentional overlapping assignment. The Gantt shows 14 days; selecting a job opens its date editor. Safety checks are stored per local calendar date.

## Migration references

- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)

Tailwind v4 uses `@tailwindcss/postcss`; the existing theme configuration is explicitly loaded with `@config` to preserve connected screens. The removed `next lint` command is replaced by ESLint for the planning frontend. Legacy dashboard regression tests now target the preserved business overview route.
