# DRISHTI — AI Retinal Screening Triage System

A Next.js 16 (App Router) + TypeScript application for AI-assisted diabetic retinopathy screening triage: patient intake, image screening with graded confidence scores, capacity planning, validation workflows, and audit-ready reporting.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York), Lucide icons, Framer Motion
- **Database**: SQLite via Prisma ORM
- **State**: Zustand (client), TanStack Query (server state)
- **PWA**: Installable, offline shell (`public/sw.js`, `public/manifest.webmanifest`)

## Getting Started

```bash
# 1. Install dependencies (bun recommended; npm/pnpm also work)
bun install

# 2. Configure environment
cp .env.example .env   # if present; otherwise create .env with DATABASE_URL below
# .env must contain:
# DATABASE_URL="file:./db/custom.db"

# 3. Push the Prisma schema to the database and seed
bun run db:push
bunx tsx prisma/seed.ts   # optional demo data

# 4. Start the dev server
bun run dev
# → http://localhost:3000
```

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start dev server on port 3000 |
| `bun run build` | Production build (standalone output) |
| `bun run start` | Run the production server |
| `bun run lint` | ESLint |
| `bun run db:push` | Push `prisma/schema.prisma` to SQLite |
| `bun run db:generate` | Generate Prisma Client |

## Project Structure

```
src/
  app/            # App Router: page + API routes (/api/patients, /api/screen, /api/capacity, ...)
  components/
    drishti/      # Domain components (score dial, stage stepper, retina view, ...)
    views/        # Screen-level views (dashboard, screening, capacity, validation, ...)
    ui/           # shadcn/ui primitives
  hooks/          # Shared React hooks
  lib/            # db client, i18n, scoring/report logic (drishti.ts, report-pdf.ts)
prisma/           # schema.prisma + seed.ts
public/           # PWA manifest, service worker, icons
worklog.md        # Development handover log
```

## Notes

- The SQLite database file (`db/custom.db`) is **not** included in this archive — recreate it with `bun run db:push`.
- `node_modules` and `.next` are excluded — run `bun install` first.
- See `worklog.md` for the full development history and `upload/DRISHTI_WEBSITE_SPEC.md` for the original product specification.
