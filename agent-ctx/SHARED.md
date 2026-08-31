# DRISHTI — Shared Component & Design Contract (for build agents)

Read this fully before writing any view. It is the single source of truth.

## Design language (MANDATORY)
- Dark medical-tech ONLY. Page bg is provided by the shell (`drishti-scene`): #060B14 → #0A1628 radial gradients.
- Accents: cyan `#22D3EE` (AI/primary) · green `#34D399` (trusted/HIGH) · amber `#FBBF24` (review/MODERATE) · red `#F87171` (urgent/LOW). NO indigo/blue/purple gradients.
- Headings `font-display` (Space Grotesk), body Inter. Numbers: add `.tabular` class.
- Cards: `.glass-card` class (glassmorphism, cyan 1px border) — add `glass-card-hover` for hover lift. Padding: `p-6` (or `p-4` in dense grids).
- Motion: framer-motion, ≤400ms, ease-out. Wrap scroll sections in `<Reveal>` (from primitives). Respect reduced motion (already global).
- Long lists: `max-h-96 overflow-y-auto drishti-scroll`.
- THE ONE RULE: trust colors (green/amber/red) are used consistently EVERYWHERE.

## Shared components — import from these exact paths
### `@/components/drishti/primitives`
- `<GlassCard className hover>` — glass card with p-6.
- `<Reveal delay y>` — scroll-reveal wrapper.
- `<SectionHeading eyebrow title sub align />` — section header block.
- `<TrustChip level="HIGH"|"MODERATE"|"LOW">` — trust badge (TRUSTED/REVIEW/URGENT).
- `<StatusChip status="AUTO_CLEARED"|"NEEDS_REVIEW"|"URGENT"|"REJECTED">`.
- `trustColors: Record<TrustLevel, string>`.

### `@/components/drishti/retina-view` — procedural SVG fundus (use it, never stock photos)
- `<RetinaView severity={0-4} dmeRisk layers={{vessels,ma,hem,ex,dme,gradcam}} blur={0..1} scanning lesions gradcam vesselDraw rejected className />`
- Layers default by severity. `scanning` shows laser sweep. `vesselDraw` animates vessel growth. `rejected` stamps REJECTED.
- Accepts explicit `lesions` + `gradcam` objects from a ScreeningResult (`result.evidence.lesions`, `result.evidence.gradcam`).

### `@/components/drishti/score-dial`
- `<ScoreDial value={0..1} size label sublabel tone="auto"|"cyan"|... decimals />` — 270° gauge, animates on mount, auto trust color.
- `<ConfBar label value color active delay />` — horizontal probability bar.

### `@/components/drishti/animated-number`
- `<AnimatedNumber value decimals prefix suffix duration startOnVisible />` — eased count-up, tabular.

### `@/components/drishti/stage-stepper`
- `type StageState = "pending"|"running"|"done"|"failed"`.
- `<StageStepper stages={[{key,label,desc,durationMs}]} states={[...]} compact />` — vertical stepper w/ glow runner.

### `@/components/drishti/shell`
- `useNav()` → `{ view, navigate(viewKey, anchor?) }` — SPA navigation (hash-based). ViewKeys: home, how, screening, dashboard, validation, capacity, about.
- `NAV_ITEMS`, `DrishtiMark` (logo SVG).

### `@/lib/drishti` (data/constants — NEVER hardcode these numbers elsewhere)
- `TRUST_THRESHOLDS = { HIGH: 0.76, MODERATE_LOW: 0.55 }` (HIGH ≥ 0.76, MODERATE 0.55–0.76, LOW < 0.55).
- `VALIDATED_METRICS` — 92.8 / 94.5 / QWK 0.899 / AUC 0.984 / "550 held-out APTOS images" / 3 runs table.
- `ICDR_CLASSES` (5-class scale with colors + referral actions), `PROB_LABELS`.
- `DEMO_CASES` — 5 presets: SEVERE-001, REVIEW-001, PATIENT-001, NORMAL-001, BADPHOTO-001.
- `runSimulatedPipeline(patientId, imageHint?)` — full ScreeningResult (used server-side).
- `CONFUSION_MATRIX`, `THRESHOLD_CURVE` (threshold→sens/spec, operating point t=0.55), `TRAINING_CURVES`, `GRADCAM_GALLERY`.
- `computeCapacity({cams,revw,arr})` → CapacityOutput; `CAPACITY_PRESETS` (phc/district/state); `districtScaling(...)`; `CAPACITY_PARAMS`.
- Types: `ScreeningResult`, `TrustLevel`, `CaseStatus`, `CapacityInput/Output`, `EvidenceResult`.
- `TEAM_MEMBERS`, `HONESTY_NOTES`.

### `@/lib/report-pdf`
- `downloadReportPdf(result: ScreeningResult)` — client-side PDF download.

## API endpoints (Next.js route handlers, same origin)
- `POST /api/screen` — JSON body `{patient_id}` or multipart `{file, patient_id}` → full `ScreeningResult` JSON (shape exactly like spec: gate/evidence/classification/explainability/trust/timings_ms).
- `GET /api/patients?filter=all|auto_cleared|needs_review|urgent|rejected` → `{count, patients:[...]}`.
- `GET /api/patients/{id}` → row + parsed `details` (ScreeningResult).
- `GET /api/metrics` → `{headline, confusion, threshold_curve, training, gradcam_gallery, source}`.
- `GET /api/capacity?cams&revw&arr` → `{input, output, params, presets, scaling}`.
- `GET /api/health`.

## Rules
1. ONLY edit your own view file: `src/components/views/<your>-view.tsx` (default export). Do NOT touch shared files, page.tsx, shell, globals.css, API routes, or other views.
2. Need a shared tweak? Note it in the worklog instead of editing shared files.
3. Use existing shadcn/ui components in `src/components/ui/*` where they fit (tabs, slider, dialog, table, select, badge...). Prefer them over custom.
4. No lorem ipsum — real DRISHTI copy. Honesty rules: "validated on 550 held-out APTOS images", never "certified"; cite APTOS 2019 — Aravind Eye Hospital; label demo data as demo.
5. Responsive: mobile-first, test 375px and 1280px layouts in your head. Touch targets ≥44px.
6. `"use client"` at top of your view file. No server actions; use the API routes above.
7. Every view needs `min-h` content that looks complete on its own; the shell handles header/footer stickiness (do NOT add your own footer).
8. Charts: `recharts` (already installed) — dark theme, cyan/green/amber/red series, grid `rgba(34,211,238,0.08)`.
9. Toasts: `import { toast } from "sonner"`.
10. Icons: `lucide-react` only.

## Worklog protocol
- Before starting: read `/home/z/my-project/worklog.md`.
- After finishing: APPEND (never overwrite) a section starting with `---`:
  ```
  ---
  Task ID: <id>
  Agent: <name>
  Task: <task>

  Work Log:
  - steps...

  Stage Summary:
  - results / decisions / artifacts
  ```
