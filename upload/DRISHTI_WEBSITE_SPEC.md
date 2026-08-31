# 🌐 DRISHTI WEBSITE — Complete Spec + Master AI-Builder Prompt

> **⚠️ Timing note:** Finish the Sep 2 internal demo FIRST. This website is
> for the SIH finale / product vision. Hand this file to the UI teammate
> (Saurav) + any AI website builder (Lovable / v0.dev / Bolt.new / Cursor).

---

## 1. THE VISION (one paragraph)

A dark, cinematic, medical-grade web platform where a health worker uploads
a retina photo and watches the **entire DRISHTI pipeline run live** — quality
gate → evidence detection → AI grading → Grad-CAM → trust routing — ending in
a color-coded clinical verdict with a full explainability report. Doctors get
a review dashboard; program managers get an interactive capacity planner.
Everything backed by our real, validated system (92.8% sensitivity / 94.5%
specificity, QWK 0.899 on 550 held-out APTOS images).

---

## 2. PAGES (7 total)

### PAGE 1 — Landing / Home
| Section | Content |
|---|---|
| Hero | Full-screen **3D animated human eye** (Three.js): iris slowly breathing, blood vessels growing on the retina, particles flowing — title "DRISHTI — AI that knows when to trust itself", CTA buttons: "Launch Screening" (cyan glow) + "Watch it work" |
| Problem strip | Animated counters: "77M diabetics in India" · "1 ophthalmologist / 100,000 rural patients" · "90% of blindness preventable if caught early" |
| Live pipeline preview | The 5 modules as an animated horizontal flow (glowing orbs connected by flowing light) |
| Trust Gate teaser | Split animation: good photo glows green, blurry photo gets stamped "REJECTED — recapture" |
| Validation banner | "92.8% sensitivity · 94.5% specificity · QWK 0.899 · 3 stable training runs" |
| Footer | Team Neural Minds · SIH 2026 PS 26038 · MathWorks · GitHub link |

### PAGE 2 — How It Works
- Vertical scroll-driven animation of the 5 modules (each lights up as you scroll)
- Each module card: icon, 2-line explanation, mini interactive demo:
  - Module 1: slider that blurs an image → trust score drops live
  - Module 2: toggle lesion layers on a retina (vessels / MAs / exudates / DME zone)
  - Module 3: 5-class ICDR scale with confidence bars
  - Module 4: Grad-CAM heatmap fading over a retina, consistency dial
  - Module 5: animated clinic queue
- "What makes us different" section: the Consistency Check story

### PAGE 3 — Screening App ⭐ (the core)
**Left panel:** upload zone (drag & drop, camera capture on mobile) + patient ID field.
**Right panel — the LIVE pipeline run (the magic moment):**
1. Stage stepper lights up one by one as the backend actually runs (~6 s):
   - ✅ Trust Gate → shows quality score dial animating (green/amber/red)
   - ✅ Evidence Engine → lesions appear on the retina image with counting ticks
   - ✅ CNN → probability bars race to a result
   - ✅ Grad-CAM → heatmap melts onto the image
   - ✅ Consistency + Trust → big trust dial with the routing verdict
2. Final **Clinical Report card**: grade + confidence, trust level (color-coded),
   DME alert banner if triggered, lesion counts, referral timeline,
   "Download report PDF" + "Send to review queue" buttons
3. All 4 showcase cases pre-loadable (SEVERE-001, REVIEW-001, PATIENT-001, NORMAL-001, BADPHOTO-001) as demo buttons

### PAGE 4 — Doctor Dashboard (Review Queue)
- Table of screened patients: ID, date, grade, confidence, trust level, status
- Filter tabs: **All / Auto-cleared (HIGH) / Needs review (MODERATE) / Urgent (LOW + DME)**
- Click a row → full report view (image, evidence overlay, Grad-CAM, trust breakdown)
- Stats cards on top: screened today, referable caught, review queue length, avg processing time
- Simulates the human-in-the-loop workflow (MODERATE cases wait for doctor sign-off)

### PAGE 5 — Validation & Evidence
- Big metric cards: 92.8% / 94.5% / QWK 0.899 / AUC 0.984
- Interactive confusion matrix (hover cells for explanations)
- Training curves + threshold ROC slider: **drag the threshold, watch sensitivity/specificity trade off live** (data from our real CSV — "the policy knob" story!)
- 3-runs stability table (91.0/92.7 · 92.8/94.5 · 93.7/94.2)
- Grad-CAM sample gallery

### PAGE 6 — Capacity Planner (interactive)
- Sliders: number of cameras (1-10), reviewers (1-6), arrivals/hour (10-60)
- Live outputs: patients/day, patients/year, mean wait time, utilization %
- Animated queue visualization + "district scaling" chart to 100,000+/year
- Preset buttons: "Single PHC", "District pilot", "State scale"

### PAGE 7 — About / Team
- Team cards with roles (from PPT slide 2), PS 26038 details, GitHub + notebook links, credits (APTOS/Aravind, STARE), license honesty note

---

## 3. DESIGN SYSTEM (the "outstanding" part)

| Element | Spec |
|---|---|
| Theme | Dark medical-tech: background `#060B14` → `#0A1628`, glassmorphism cards (`backdrop-blur`, 1px cyan borders) |
| Accent colors | Cyan `#22D3EE` (primary/AI), green `#34D399` (trusted), amber `#FBBF24` (review), red `#F87171` (urgent/DME) |
| Typography | Headings: "Space Grotesk" (700) · Body: "Inter" (400/500) · Numbers: tabular figures |
| 3D | **react-three-fiber + drei**: hero eye model (procedural iris + growing vessel lines using `TubeGeometry` along curves), floating particles, subtle mouse parallax. Fallback: static gradient blob on low-end devices |
| Motion | framer-motion: scroll reveals, stage-stepper transitions, number count-ups, layout animations. Everything ≤ 400ms, ease-out. Respect `prefers-reduced-motion` |
| Charts | recharts (ROC, bars, gauges) — dark-theme styled |
| Micro-details | scanning laser-line sweep over uploaded images while processing · skeleton loaders shaped like the report · sound OFF by default |
| The ONE rule | Trust colors (green/amber/red) are used consistently EVERYWHERE — same language as the console |

---

## 4. TECH STACK

```
FRONTEND  Next.js 14 (App Router) + TypeScript + Tailwind CSS
          + framer-motion + @react-three/fiber + recharts
          (deploy: Vercel — free)

BACKEND   Python FastAPI — because our whole pipeline IS Python
          + torch + opencv (loads our existing modules as-is)
          (deploy: Render / Railway / HuggingFace Spaces — free CPU tier,
           needs ~2 GB RAM for torch; or run locally on the demo laptop)

STORAGE   SQLite (patients table) + /reports folder for PNG reports
```

**Why FastAPI:** the backend literally imports our existing files
(`src/module1_quality_gate.py` etc.) — zero rewriting. One `uvicorn` command
runs everything.

---

## 5. BACKEND ARCHITECTURE — how everything connects

```
Browser (Next.js on Vercel)
   │  POST /api/screen  (multipart: retina image + patient id)
   ▼
FastAPI server (our machine / Render)
   │  1. saves upload        → runs module1 (quality gate)
   │  2. if ACCEPT           → module2 (evidence)
   │  3.                     → module4.explain()  (loads drishti_dr_model.pt ONCE at startup,
   │                           runs CNN + Grad-CAM + consistency + trust)
   │  4. saves report PNG    → inserts row in SQLite
   ▼
JSON response → frontend animates the stages in ~real time
   (backend returns stage timings so the stepper matches reality)
```

### API contract

| Endpoint | Method | Returns |
|---|---|---|
| `/api/screen` | POST | `{patient_id, gate:{quality_score, enhanced}, evidence:{ma_count, hem_count, ex_count, vessel_density_pct, dme_risk, dme_message}, classification:{predicted_class, confidence, probabilities}, explainability:{consistency, verdict, centroid_distance_dd, region_overlap}, trust:{trust_score, trust_level, route}, report_url, timings_ms:{gate, evidence, classify, explain}}` |
| `/api/patients?filter=` | GET | list for the dashboard table |
| `/api/patients/{id}` | GET | one full case + report image URL |
| `/api/metrics` | GET | the APTOS validation numbers + confusion matrix + threshold curve points |
| `/api/capacity?cams=3&revw=2&arr=25` | GET | capacity numbers (reuse `module5_capacity_planner.py` math) |
| `/health` | GET | model loaded? version? (for judges: transparency) |

### The backend in ~40 lines (skeleton — give this to the AI builder too)

```python
# backend/main.py  — run: uvicorn main:app --port 8000
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import sys, os, uuid
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "DRISHTI_portable", "src"))
import pipeline  # our existing module!

app = FastAPI(title="DRISHTI API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/screen")
async def screen(file: UploadFile = File(...), patient_id: str = Form(...)):
    path = f"/tmp/{uuid.uuid4()}.png"
    with open(path, "wb") as f: f.write(await file.read())
    result = pipeline.run_full_pipeline(path, patient_id=patient_id, verbose=False)
    return {k: v for k, v in result.items() if k != "gradcam"}
```

**How the frontend connects:** `fetch("http://localhost:8000/api/screen", {method:"POST", body: formData})` → animate stages using `timings_ms` while awaiting the response (or upgrade to WebSockets later for true stage-by-stage streaming).

---

## 6. 🤖 THE MASTER PROMPT (copy-paste into Lovable / v0.dev / Bolt.new / Cursor)

> Build a production-quality, dark-themed medical AI web platform called
> **"DRISHTI — Trust-Gated DR Screening"** for Smart India Hackathon 2026
> (PS 26038, MathWorks). Stack: **Next.js 14 + TypeScript + Tailwind +
> framer-motion + @react-three/fiber + recharts**. Fully responsive.
>
> **DESIGN LANGUAGE:** Cinematic dark medical-tech. Background #060B14 with
> subtle radial gradients; glassmorphism cards (backdrop-blur, 1px
> rgba(34,211,238,.25) border); accent cyan #22D3EE, success green #34D399,
> review amber #FBBF24, urgent red #F87171. Fonts: Space Grotesk (headings),
> Inter (body). Generous spacing, large numerals with tabular figures,
> soft glows, 300-400ms ease-out transitions, scroll-triggered reveals.
> No clutter — premium and calm, like a medical device, not a SaaS dashboard.
>
> **HERO:** full-viewport react-three-fiber scene — a stylized 3D human eye,
> iris slowly dilating, luminous cyan blood vessels growing across the
> retina (TubeGeometry along animated curves), floating particle field,
> gentle mouse parallax. Overlay: "DRISHTI" + tagline "AI that knows when
> to trust itself." + buttons [Launch Screening] [How it works].
>
> **7 PAGES:**
> 1. **Home** — hero; animated counters (77M diabetics · 1 ophthalmologist
>    per 100k rural · 90% preventable); 5-module animated pipeline flow;
>    validation banner: "92.8% sensitivity · 94.5% specificity · QWK 0.899".
> 2. **How It Works** — scroll-driven 5 module cards, each with a micro-demo:
>    blur slider affecting a live quality dial; lesion-layer toggles on a
>    retina image; ICDR 0-4 scale with probability bars; Grad-CAM heatmap
>    crossfade; animated queue.
> 3. **Screening** ⭐ — left: drag-drop upload + patient ID + 5 preset demo
>    case buttons (SEVERE-001, REVIEW-001, PATIENT-001, NORMAL-001,
>    BADPHOTO-001). Right: 5-step stage stepper (Trust Gate → Evidence →
>    CNN → Grad-CAM → Trust) that lights up sequentially with a laser
>    scan-line over the image; then a Clinical Report card: grade,
>    confidence, big trust dial (green ≥0.76 HIGH / amber 0.55-0.76
>    MODERATE / red LOW), DME alert banner, lesion counts, referral
>    timeline, Download PDF button.
> 4. **Doctor Dashboard** — stats cards (screened today, referable caught,
>    review queue, avg time); patient table with filter tabs
>    All / Auto-cleared / Needs review / Urgent; row click opens a full
>    report modal (retina, evidence overlay, Grad-CAM, trust breakdown).
> 5. **Validation** — metric cards (92.8% / 94.5% / QWK 0.899 / AUC 0.984);
>    interactive 5x5 confusion matrix with hover tooltips; training curves;
>    a draggable threshold slider (0.2-0.8) showing sensitivity/specificity
>    trading off on a live chart with both target lines (90% / 85%);
>    3-runs stability table.
> 6. **Capacity Planner** — sliders (cameras 1-10, reviewers 1-6,
>    arrivals/hour 10-60) → live cards (patients/day, /year, mean wait,
>    utilization) + animated queue + presets (Single PHC / District /
>    State).
> 7. **About** — 6 team cards with roles, PS info, GitHub link, data credits
>    (APTOS 2019 — Aravind Eye Hospital; STARE — Clemson).
>
> **API INTEGRATION:** the backend is a FastAPI server exposing
> POST /api/screen (image+patient_id → the full JSON result incl.
> trust level and report image URL), GET /api/patients, /api/metrics,
> /api/capacity, /health. Wire the Screening page to POST /api/screen,
> the Dashboard to /api/patients, Validation to /api/metrics, Capacity to
> /api/capacity. Use a NEXT_PUBLIC_API_URL env var. Until the backend is
> live, load realistic mock data matching this exact JSON shape:
> {gate:{quality_score:0.82,enhanced:true}, evidence:{ma_count:100,
> hem_count:41, ex_count:22, vessel_density_pct:11.3, dme_risk:true,
> dme_message:"URGENT: exudate within 0.29 DD of fovea"},
> classification:{predicted_class:"NPDR - Referable (Level 2-3)",
> confidence:0.658, probabilities:{"No DR (Level 0)":0.27,
> "NPDR - Referable (Level 2-3)":0.658,"PDR - Urgent (Level 4)":0.072}},
> explainability:{consistency:0.903, verdict:"HIGH",
> centroid_distance_dd:0.73, region_overlap:1.0}, trust:{trust_score:0.789,
> trust_level:"HIGH", route:"TRUSTED - auto screening recommendation"}}.
>
> Polish bar: Lighthouse 90+, mobile-perfect, accessible contrast,
> loading skeletons, error states, empty states. No lorem ipsum anywhere —
> use the real copy above.

---

## 7. BUILD ORDER (for the team, ~2-3 days with AI builders)

| Day | Task |
|---|---|
| 1 AM | Paste Master Prompt into Lovable/v0 → generate frontend with mock data → fix branding |
| 1 PM | Backend: create `backend/main.py` (skeleton above) next to DRISHTI_portable → `pip install fastapi uvicorn python-multipart` → `uvicorn main:app` → test /api/screen with curl |
| 2 AM | Connect frontend to real backend (env var), tune the stage animation timings to `timings_ms` |
| 2 PM | Capacity + Validation pages wired to real math/CSV; PDF download; mobile pass |
| 3 | Deploy: frontend → Vercel; backend → Render/Railway (or laptop for offline demos); record finale video |

**Offline-demo fallback (important for finale):** the website also runs
100% locally — `uvicorn` + `npm run build && npx serve out` on the demo
laptop. No internet needed on stage, same as now.

## 8. HONESTY RULES (keep our credibility)

- Website says "validated on 550 held-out APTOS images" — never "certified" or "clinical-grade"
- Always cite: *Data: APTOS 2019, Aravind Eye Hospital (Kaggle)*
- The review dashboard demonstrates the workflow — label demo data as demo
- Keep the trust thresholds (0.76/0.55) and numbers EXACTLY as in our guides
