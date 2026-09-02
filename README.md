# DRISHTI — Trust-Gated Retinal Screening

DRISHTI is an explainable diabetic-retinopathy screening and triage prototype for **SIH 2026, Problem Statement 26038 (MathWorks)**. It combines a Next.js web application with Python/MATLAB implementations for image quality gating, retinal evidence extraction, DR grading, explainability, trust scoring, human review, and capacity planning.

> **Important:** DRISHTI is a research/demo prototype, not a medical device or a substitute for an ophthalmologist. Its outputs require clinical review.

## Included

- Responsive PWA-style web app: Home, How It Works, Live Screening, Doctor Dashboard, Validation, Capacity, and About.
- Upload/camera screening, five-stage playback, annotated retina/Grad-CAM view, trust routing, PDF reports, and recapture guidance.
- Persistent patient queue, filters, sign-off, bulk sign-off, CSV export, and audit history.
- Next.js API routes backed by Prisma and SQLite.
- Optional FastAPI service using the MATLAB Engine when available, then the Python pipeline, with a demo fallback.
- Portable Python/MATLAB pipeline, sample STARE data, models, APTOS training material, and results.

## Architecture

```text
Browser/PWA → Next.js 16 + React 19 → API routes → Prisma/SQLite
                  │
                  └→ optional FastAPI :8000 → MATLAB Engine or Python pipeline
                                             └→ DRISHTI_portable/src
```

The five modules are Trust Gate, Evidence Engine, DR Grading, Explainability, and Trust Routing/Capacity. Grading uses five ICDR levels (No DR through PDR).

## Web app quick start

Requirements: Bun or Node.js and Python only if you want the real backend.

```bash
bun install                         # npm install also works
bun run db:generate
bun run db:push
bunx tsx prisma/seed.ts              # optional demo records
bun run dev
```

Create `.env` with a local database path (do not commit it):

```env
DATABASE_URL="file:./prisma/dev.db"
NEXT_PUBLIC_DRISHTI_BACKEND_URL="http://127.0.0.1:8000"
```

Open <http://localhost:3000>. Available scripts:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Development server on port 3000 |
| `bun run build` | Standalone production build |
| `bun run start` | Start the production build |
| `bun run lint` | Run ESLint |
| `bun run db:generate` | Generate Prisma Client |
| `bun run db:push` | Push schema to SQLite |
| `bun run db:migrate` | Create/apply a Prisma migration |

## API routes

`POST /api/screen`; `GET /api/patients` and `/api/patients/:id`; `PATCH /api/patients/:id/status`; `POST /api/patients/bulk-signoff`; `GET /api/patients/export`; `GET /api/patients/audit`; `GET /api/metrics`; `GET /api/capacity`; and `GET /api/health`.

## Optional FastAPI backend

```bash
cd backend
python -m pip install -r requirements.txt
python main.py
```

The service listens on `http://127.0.0.1:8000` and imports the pipeline from `../DRISHTI_portable/src`.

## Portable Python and MATLAB

See [DRISHTI_portable/README.md](DRISHTI_portable/README.md) and [DRISHTI_portable/SETUP_GUIDE.md](DRISHTI_portable/SETUP_GUIDE.md).

```bash
cd DRISHTI_portable
python run_demo.py
python src/pipeline.py data/stare_images/im0001.png --id PATIENT-001
python src/evaluate_model.py
python src/module5_capacity_planner.py
```

The package also contains `matlab/DRISHTI.m`, module scripts, a Simulink/SimEvents capacity builder, APTOS training material, model files, and example results.

## Validation

The current web-facing constants in `src/lib/drishti.ts` record **87.0% sensitivity, 94.5% specificity, and QWK 0.8766** on **550 held-out APTOS images** for the supplied MATLAB ResNet-101 artifact. These are research/demo figures, not clinical performance claims. Re-evaluate any newly trained model on a held-out test set before reporting metrics.

## Repository map

```text
src/app/                 Next.js page, layout, and API routes
src/components/views/    Screen-level views
src/components/drishti/  Domain components and visualizations
src/components/ui/       UI primitives
src/lib/                 Types, demo data, database, i18n, and PDF reports
prisma/                  SQLite schema and seed
backend/                 FastAPI adapter and MATLAB bridge
DRISHTI_portable/        Python/MATLAB pipeline, models, data, results
model_and_result/         MATLAB scripts and validation artifacts
public/                  PWA assets and offline shell
examples/                WebSocket example
tests/                    Runtime/container build scripts
scripts/                  Development helpers
upload/                  Product specification
worklog.md               Detailed development history
```

Generated files, local databases, uploads, reports, environment files, and large archives are excluded from normal version control; see `.gitignore`. No software license is currently declared. Check dataset/model terms before redistribution.
