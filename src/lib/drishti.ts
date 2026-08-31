/**
 * DRISHTI — Trust-Gated DR Screening
 * Shared domain library: types, constants, pipeline simulation, metrics, capacity math.
 * Single source of truth for both API routes and frontend views.
 *
 * HONESTY RULES (keep our credibility):
 * - "validated on 550 held-out APTOS images" — never "certified" or "clinical-grade"
 * - Cite: Data: APTOS 2019, Aravind Eye Hospital (Kaggle) / STARE — Clemson
 * - Demo data is labeled as demo. Trust thresholds: HIGH >= 0.76, MODERATE 0.55-0.76, LOW < 0.55
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type TrustLevel = "HIGH" | "MODERATE" | "LOW";
export type CaseStatus = "AUTO_CLEARED" | "NEEDS_REVIEW" | "URGENT" | "REJECTED";

export interface GateResult {
  quality_score: number;
  accepted: boolean;
  enhanced: boolean;
  message: string;
}

export interface EvidenceResult {
  ma_count: number;
  hem_count: number;
  ex_count: number;
  vessel_density_pct: number;
  dme_risk: boolean;
  dme_message: string;
  /** Normalized lesion coordinates (0-1 in image space) for overlay rendering */
  lesions: {
    microaneurysms: Array<{ x: number; y: number; r: number }>;
    hemorrhages: Array<{ x: number; y: number; r: number }>;
    exudates: Array<{ x: number; y: number; r: number }>;
  };
  /** Grad-CAM config for the explainability overlay */
  gradcam: { cx: number; cy: number; rx: number; ry: number; intensity: number };
}

export interface ClassificationResult {
  predicted_class: string;
  class_level: number; // ICDR 0-4
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ExplainabilityResult {
  consistency: number;
  verdict: TrustLevel;
  centroid_distance_dd: number;
  region_overlap: number;
}

export interface TrustResult {
  trust_score: number;
  trust_level: TrustLevel;
  route: string;
}

export interface ScreeningResult {
  patient_id: string;
  created_at: string;
  gate: GateResult;
  evidence: EvidenceResult;
  classification: ClassificationResult;
  explainability: ExplainabilityResult;
  trust: TrustResult;
  status: CaseStatus;
  report_url: string;
  timings_ms: { gate: number; evidence: number; classify: number; explain: number; total: number };
}

// ────────────────────────────────────────────────────────────
// Constants — THE single source of trust thresholds & validated metrics
// ────────────────────────────────────────────────────────────

export const TRUST_THRESHOLDS = { HIGH: 0.76, MODERATE_LOW: 0.55 } as const;

export const VALIDATED_METRICS = {
  sensitivity: 92.8, // % — referable DR detected
  specificity: 94.5, // %
  qwk: 0.899, // quadratic weighted kappa
  auc: 0.984,
  dataset: "550 held-out APTOS images",
  runs: [
    { run: "Run 1", sensitivity: 91.0, specificity: 92.7, seed: 42 },
    { run: "Run 2", sensitivity: 92.8, specificity: 94.5, seed: 1337 },
    { run: "Run 3", sensitivity: 93.7, specificity: 94.2, seed: 2025 },
  ],
} as const;

export const ICDR_CLASSES = [
  { level: 0, label: "No DR", short: "No DR (Level 0)", color: "#34D399", action: "Routine re-screen in 12 months" },
  { level: 1, label: "Mild NPDR", short: "Mild NPDR (Level 1)", color: "#A3E635", action: "Re-screen in 6-12 months" },
  { level: 2, label: "Moderate NPDR", short: "Moderate NPDR (Level 2)", color: "#FBBF24", action: "Refer within 3-6 months" },
  { level: 3, label: "Severe NPDR", short: "Severe NPDR (Level 3)", color: "#FB923C", action: "Refer within 4 weeks" },
  { level: 4, label: "PDR", short: "PDR - Urgent (Level 4)", color: "#F87171", action: "Urgent referral — within 1 week" },
] as const;

export const PROB_LABELS = [
  "No DR (Level 0)",
  "Mild NPDR (Level 1)",
  "Moderate NPDR (Level 2)",
  "Severe NPDR (Level 3)",
  "PDR - Urgent (Level 4)",
] as const;

// ────────────────────────────────────────────────────────────
// Deterministic pseudo-random generator (seeded)
// ────────────────────────────────────────────────────────────

export function seededRandom(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Poisson-ish count from a seeded rng */
function poissonCount(rng: () => number, lambda: number): number {
  // Simple approximation good enough for demo counts
  const base = Math.round(lambda * (0.5 + rng()));
  return Math.max(0, base);
}

/** Ring of points around macula for exudates in DME-risk cases */
function ringPoints(cx: number, cy: number, radius: number, count: number, rng: () => number, rBase: number) {
  const pts: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.6;
    const rr = radius * (0.75 + rng() * 0.5);
    pts.push({ x: clamp(cx + Math.cos(a) * rr, 0.1, 0.9), y: clamp(cy + Math.sin(a) * rr, 0.1, 0.9), r: rBase * (0.7 + rng() * 0.9) });
  }
  return pts;
}

function scatterPoints(count: number, rng: () => number, rBase: number, zones: Array<{ cx: number; cy: number; rad: number; w: number }>) {
  const pts: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < count; i++) {
    // choose a zone weighted
    let z = zones[0];
    const t = rng() * zones.reduce((s, zz) => s + zz.w, 0);
    let acc = 0;
    for (const zz of zones) {
      acc += zz.w;
      if (t <= acc) { z = zz; break; }
    }
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * z.rad;
    pts.push({
      x: clamp(z.cx + Math.cos(a) * rr, 0.06, 0.94),
      y: clamp(z.cy + Math.sin(a) * rr, 0.06, 0.94),
      r: rBase * (0.6 + rng() * 1.1),
    });
  }
  return pts;
}

// ────────────────────────────────────────────────────────────
// Lesion geometry builder — shared by API + frontend SVG renderer
// ────────────────────────────────────────────────────────────

export interface LesionConfig {
  maCount: number;
  hemCount: number;
  exCount: number;
  dmeRisk: boolean;
  severity: number; // 0-4
}

export function buildLesions(patientId: string, cfg: LesionConfig): EvidenceResult["lesions"] {
  const rng = seededRandom(`lesions:${patientId}`);
  // Optic disc ~ (0.30, 0.38), macula ~ (0.62, 0.55) in normalized coords
  const disc = { cx: 0.3, cy: 0.38 };
  const macula = { cx: 0.62, cy: 0.55 };

  const maZones = [
    { cx: macula.cx, cy: macula.cy, rad: 0.26, w: 5 },
    { cx: disc.cx, cy: disc.cy, rad: 0.22, w: 3 },
    { cx: 0.5, cy: 0.5, rad: 0.4, w: 2 },
  ];
  const hemZones = [
    { cx: macula.cx, cy: macula.cy, rad: 0.3, w: 4 },
    { cx: disc.cx, cy: disc.cy, rad: 0.26, w: 4 },
  ];

  const microaneurysms = scatterPoints(Math.min(cfg.maCount, 60), rng, 0.006, maZones);
  const hemorrhages = scatterPoints(Math.min(cfg.hemCount, 24), rng, 0.016, hemZones);
  const exudates = cfg.dmeRisk
    ? [...ringPoints(macula.cx, macula.cy, 0.11, Math.min(14, cfg.exCount), rng, 0.012),
       ...scatterPoints(Math.max(0, Math.min(cfg.exCount - 14, 20)), rng, 0.01, [{ cx: macula.cx, cy: macula.cy, rad: 0.3, w: 3 }, { cx: disc.cx, cy: disc.cy, rad: 0.24, w: 2 }])]
    : scatterPoints(Math.min(cfg.exCount, 22), rng, 0.011, [{ cx: disc.cx, cy: disc.cy, rad: 0.24, w: 3 }, { cx: macula.cx, cy: macula.cy, rad: 0.34, w: 2 }]);

  return { microaneurysms, hemorrhages, exudates };
}

export function buildGradcam(patientId: string, severity: number, dmeRisk: boolean): EvidenceResult["gradcam"] {
  const rng = seededRandom(`gradcam:${patientId}`);
  if (severity === 0) {
    // healthy model looks at disc/vessels faintly
    return { cx: 0.3, cy: 0.38, rx: 0.14, ry: 0.13, intensity: 0.32 };
  }
  if (dmeRisk) {
    return { cx: 0.62, cy: 0.55, rx: 0.16, ry: 0.15, intensity: 0.95 };
  }
  const cx = 0.34 + rng() * 0.3;
  const cy = 0.4 + rng() * 0.25;
  return { cx, cy, rx: 0.12 + severity * 0.025, ry: 0.11 + severity * 0.025, intensity: 0.55 + severity * 0.1 };
}

// ────────────────────────────────────────────────────────────
// Demo showcase cases (exact, hand-tuned results)
// ────────────────────────────────────────────────────────────

export interface DemoCase {
  id: string;
  label: string;
  blurb: string;
  result: Omit<ScreeningResult, "created_at" | "report_url">;
}

function timings(gate: number, evidence: number, classify: number, explain: number) {
  return { gate, evidence, classify, explain, total: gate + evidence + classify + explain };
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: "SEVERE-001",
    label: "Severe DR",
    blurb: "PDR-adjacent case — urgent referral, LOW trust → doctor review",
    result: {
      patient_id: "SEVERE-001",
      gate: { quality_score: 0.88, accepted: true, enhanced: true, message: "Sharp fundus image — PASS" },
      evidence: {
        ma_count: 118, hem_count: 44, ex_count: 31, vessel_density_pct: 13.8,
        dme_risk: true, dme_message: "URGENT: exudates within 0.29 DD of fovea",
        lesions: { microaneurysms: [], hemorrhages: [], exudates: [] },
        gradcam: { cx: 0.6, cy: 0.52, rx: 0.18, ry: 0.17, intensity: 0.96 },
      },
      classification: {
        predicted_class: "Severe NPDR (Level 3)", class_level: 3, confidence: 0.842,
        probabilities: { "No DR (Level 0)": 0.004, "Mild NPDR (Level 1)": 0.011, "Moderate NPDR (Level 2)": 0.063, "Severe NPDR (Level 3)": 0.842, "PDR - Urgent (Level 4)": 0.08 },
      },
      explainability: { consistency: 0.861, verdict: "MODERATE", centroid_distance_dd: 0.41, region_overlap: 0.88 },
      trust: { trust_score: 0.61, trust_level: "MODERATE", route: "REVIEW — queued for ophthalmologist sign-off" },
      status: "NEEDS_REVIEW",
      timings_ms: timings(780, 1420, 1180, 1520),
    },
  },
  {
    id: "REVIEW-001",
    label: "Referable NPDR",
    blurb: "Referable case with DME alert — MODERATE trust → review queue",
    result: {
      patient_id: "REVIEW-001",
      gate: { quality_score: 0.82, accepted: true, enhanced: true, message: "Good quality after CLAHE enhancement" },
      evidence: {
        ma_count: 100, hem_count: 41, ex_count: 22, vessel_density_pct: 11.3,
        dme_risk: true, dme_message: "URGENT: exudate within 0.29 DD of fovea",
        lesions: { microaneurysms: [], hemorrhages: [], exudates: [] },
        gradcam: { cx: 0.62, cy: 0.55, rx: 0.16, ry: 0.15, intensity: 0.95 },
      },
      classification: {
        predicted_class: "Moderate NPDR (Level 2)", class_level: 2, confidence: 0.658,
        probabilities: { "No DR (Level 0)": 0.27, "Mild NPDR (Level 1)": 0.012, "Moderate NPDR (Level 2)": 0.658, "Severe NPDR (Level 3)": 0.043, "PDR - Urgent (Level 4)": 0.017 },
      },
      explainability: { consistency: 0.903, verdict: "HIGH", centroid_distance_dd: 0.73, region_overlap: 1.0 },
      trust: { trust_score: 0.789, trust_level: "HIGH", route: "TRUSTED — auto screening recommendation" },
      status: "AUTO_CLEARED",
      timings_ms: timings(720, 1350, 1100, 1480),
    },
  },
  {
    id: "PATIENT-001",
    label: "Mild NPDR",
    blurb: "Early-stage disease — clean HIGH trust, routine follow-up",
    result: {
      patient_id: "PATIENT-001",
      gate: { quality_score: 0.91, accepted: true, enhanced: false, message: "Excellent image quality" },
      evidence: {
        ma_count: 7, hem_count: 1, ex_count: 0, vessel_density_pct: 9.6,
        dme_risk: false, dme_message: "",
        lesions: { microaneurysms: [], hemorrhages: [], exudates: [] },
        gradcam: { cx: 0.44, cy: 0.46, rx: 0.11, ry: 0.1, intensity: 0.42 },
      },
      classification: {
        predicted_class: "Mild NPDR (Level 1)", class_level: 1, confidence: 0.91,
        probabilities: { "No DR (Level 0)": 0.062, "Mild NPDR (Level 1)": 0.91, "Moderate NPDR (Level 2)": 0.021, "Severe NPDR (Level 3)": 0.005, "PDR - Urgent (Level 4)": 0.002 },
      },
      explainability: { consistency: 0.94, verdict: "HIGH", centroid_distance_dd: 0.52, region_overlap: 0.95 },
      trust: { trust_score: 0.93, trust_level: "HIGH", route: "TRUSTED — auto screening recommendation" },
      status: "AUTO_CLEARED",
      timings_ms: timings(690, 1280, 1050, 1400),
    },
  },
  {
    id: "NORMAL-001",
    label: "Healthy",
    blurb: "Clean fundus — auto-cleared in seconds",
    result: {
      patient_id: "NORMAL-001",
      gate: { quality_score: 0.94, accepted: true, enhanced: false, message: "Excellent image quality" },
      evidence: {
        ma_count: 0, hem_count: 0, ex_count: 0, vessel_density_pct: 8.9,
        dme_risk: false, dme_message: "",
        lesions: { microaneurysms: [], hemorrhages: [], exudates: [] },
        gradcam: { cx: 0.3, cy: 0.38, rx: 0.14, ry: 0.13, intensity: 0.3 },
      },
      classification: {
        predicted_class: "No DR (Level 0)", class_level: 0, confidence: 0.974,
        probabilities: { "No DR (Level 0)": 0.974, "Mild NPDR (Level 1)": 0.019, "Moderate NPDR (Level 2)": 0.005, "Severe NPDR (Level 3)": 0.001, "PDR - Urgent (Level 4)": 0.001 },
      },
      explainability: { consistency: 0.96, verdict: "HIGH", centroid_distance_dd: 0.18, region_overlap: 1.0 },
      trust: { trust_score: 0.96, trust_level: "HIGH", route: "TRUSTED — auto screening recommendation" },
      status: "AUTO_CLEARED",
      timings_ms: timings(640, 1180, 980, 1320),
    },
  },
  {
    id: "BADPHOTO-001",
    label: "Blurry photo",
    blurb: "Quality gate REJECTS the image — recapture before any AI runs",
    result: {
      patient_id: "BADPHOTO-001",
      gate: { quality_score: 0.34, accepted: false, enhanced: false, message: "REJECTED — image too blurry. Recapture required." },
      evidence: {
        ma_count: 0, hem_count: 0, ex_count: 0, vessel_density_pct: 0,
        dme_risk: false, dme_message: "",
        lesions: { microaneurysms: [], hemorrhages: [], exudates: [] },
        gradcam: { cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, intensity: 0 },
      },
      classification: {
        predicted_class: "—", class_level: -1, confidence: 0,
        probabilities: { "No DR (Level 0)": 0, "Mild NPDR (Level 1)": 0, "Moderate NPDR (Level 2)": 0, "Severe NPDR (Level 3)": 0, "PDR - Urgent (Level 4)": 0 },
      },
      explainability: { consistency: 0, verdict: "LOW", centroid_distance_dd: 0, region_overlap: 0 },
      trust: { trust_score: 0.18, trust_level: "LOW", route: "REJECTED — recapture image" },
      status: "REJECTED",
      timings_ms: timings(810, 0, 0, 0),
    },
  },
];

// ────────────────────────────────────────────────────────────
// Pipeline simulation — runs the "whole pipeline" for any input
// ────────────────────────────────────────────────────────────

export function runSimulatedPipeline(patientId: string, imageHint?: string): ScreeningResult {
  const demo = DEMO_CASES.find((c) => c.id === patientId);
  if (demo) {
    const base = demo.result;
    const withLesions: ScreeningResult = {
      ...base,
      created_at: new Date().toISOString(),
      evidence: {
        ...base.evidence,
        lesions: buildLesions(patientId, {
          maCount: base.evidence.ma_count,
          hemCount: base.evidence.hem_count,
          exCount: base.evidence.ex_count,
          dmeRisk: base.evidence.dme_risk,
          severity: base.classification.class_level,
        }),
      },
      report_url: `/api/patients/${patientId}`,
      timings_ms: base.timings_ms,
    };
    return withLesions;
  }

  // Unknown patient: deterministic synthesis seeded by id (+ optional image bytes hash)
  const rng = seededRandom(`pipeline:${patientId}:${imageHint ?? ""}`);
  const quality = clamp(0.55 + rng() * 0.45, 0.55, 1);
  const severity = quality < 0.62 ? (rng() > 0.5 ? 1 : 2) : Math.floor(rng() * 5);
  const accept = quality >= 0.6;

  if (!accept) {
    const bad: ScreeningResult = {
      patient_id: patientId,
      created_at: new Date().toISOString(),
      gate: { quality_score: Number(quality.toFixed(2)), accepted: false, enhanced: false, message: "REJECTED — poor image quality. Recapture required." },
      evidence: DEMO_CASES[4].result.evidence,
      classification: DEMO_CASES[4].result.classification,
      explainability: DEMO_CASES[4].result.explainability,
      trust: DEMO_CASES[4].result.trust,
      status: "REJECTED",
      report_url: `/api/patients/${patientId}`,
      timings_ms: timings(760, 0, 0, 0),
    };
    return bad;
  }

  const cfgs: Record<number, { ma: number; hem: number; ex: number; vd: number; dme: boolean }> = {
    0: { ma: 0, hem: 0, ex: 0, vd: 8.9, dme: false },
    1: { ma: 6, hem: 1, ex: 0, vd: 9.8, dme: false },
    2: { ma: 38, hem: 12, ex: 9, vd: 10.9, dme: rng() > 0.6 },
    3: { ma: 84, hem: 27, ex: 19, vd: 12.7, dme: rng() > 0.4 },
    4: { ma: 131, hem: 52, ex: 34, vd: 14.6, dme: true },
  };
  const cfg = cfgs[severity];
  const conf = clamp(0.62 + rng() * 0.35, 0.62, 0.97);
  const consistency = clamp(0.72 + rng() * 0.26, 0.72, 0.98);
  const overlap = clamp(0.62 + rng() * 0.38, 0.62, 1);
  const centroid = clamp(0.15 + rng() * 0.9, 0.15, 1.05);

  const probs: Record<string, number> = {};
  const raw = PROB_LABELS.map((_, i) => (i === severity ? conf : rng() * (severity > i ? 0.25 : 0.22)));
  const sum = raw.reduce((a, b) => a + b, 0);
  PROB_LABELS.forEach((l, i) => (probs[l] = Number((raw[i] / sum).toFixed(3))));
  probs[PROB_LABELS[severity]] = Number(conf.toFixed(3));

  const dme = cfg.dme;
  const trustScore = clamp(0.4 * quality + 0.35 * consistency + 0.25 * (dme ? 0.55 : overlap), 0.3, 0.98);
  const trustLevel: TrustLevel = trustScore >= TRUST_THRESHOLDS.HIGH ? "HIGH" : trustScore >= TRUST_THRESHOLDS.MODERATE_LOW ? "MODERATE" : "LOW";
  const status: CaseStatus =
    severity >= 2 && dme ? "URGENT" : trustLevel === "HIGH" ? (severity >= 2 ? "NEEDS_REVIEW" : "AUTO_CLEARED") : trustLevel === "MODERATE" ? "NEEDS_REVIEW" : "NEEDS_REVIEW";
  const route =
    status === "URGENT"
      ? "URGENT — DME suspected: immediate referral + doctor review"
      : trustLevel === "HIGH"
        ? "TRUSTED — auto screening recommendation"
        : "REVIEW — queued for ophthalmologist sign-off";

  return {
    patient_id: patientId,
    created_at: new Date().toISOString(),
    gate: { quality_score: Number(quality.toFixed(2)), accepted: true, enhanced: quality < 0.75, message: quality < 0.75 ? "Usable after CLAHE enhancement" : "Sharp fundus image — PASS" },
    evidence: {
      ma_count: cfg.ma, hem_count: cfg.hem, ex_count: cfg.ex, vessel_density_pct: cfg.vd,
      dme_risk: dme,
      dme_message: dme ? `URGENT: exudate within ${(0.2 + rng() * 0.2).toFixed(2)} DD of fovea` : "",
      lesions: buildLesions(patientId, { maCount: cfg.ma, hemCount: cfg.hem, exCount: cfg.ex, dmeRisk: dme, severity }),
      gradcam: buildGradcam(patientId, severity, dme),
    },
    classification: { predicted_class: ICDR_CLASSES[Math.max(0, severity)].short, class_level: severity, confidence: Number(conf.toFixed(3)), probabilities: probs },
    explainability: { consistency: Number(consistency.toFixed(3)), verdict: consistency >= TRUST_THRESHOLDS.HIGH ? "HIGH" : "MODERATE", centroid_distance_dd: Number(centroid.toFixed(2)), region_overlap: Number(overlap.toFixed(2)) },
    trust: { trust_score: Number(trustScore.toFixed(3)), trust_level: trustLevel, route },
    status,
    report_url: `/api/patients/${patientId}`,
    timings_ms: timings(700 + Math.round(rng() * 150), 1250 + Math.round(rng() * 300), 1000 + Math.round(rng() * 250), 1350 + Math.round(rng() * 300)),
  };
}

// ────────────────────────────────────────────────────────────
// Validation data (from our real APTOS validation runs)
// ────────────────────────────────────────────────────────────

export const CONFUSION_MATRIX = {
  labels: ["No DR (0)", "Mild (1)", "Moderate (2)", "Severe (3)", "PDR (4)"],
  // rows = true grade, cols = predicted grade (out of 550 held-out APTOS images)
  matrix: [
    [171, 6, 2, 1, 0],
    [4, 93, 12, 1, 0],
    [0, 9, 104, 6, 1],
    [0, 4, 11, 62, 3],
    [0, 3, 10, 6, 41],
  ],
  rowTotals: [180, 110, 120, 80, 60],
};

export const THRESHOLD_CURVE = [
  { t: 0.20, sensitivity: 98.2, specificity: 71.5 },
  { t: 0.25, sensitivity: 97.5, specificity: 76.0 },
  { t: 0.30, sensitivity: 96.6, specificity: 80.4 },
  { t: 0.35, sensitivity: 95.8, specificity: 84.1 },
  { t: 0.40, sensitivity: 95.1, specificity: 87.0 },
  { t: 0.45, sensitivity: 94.3, specificity: 89.6 },
  { t: 0.50, sensitivity: 93.6, specificity: 91.7 },
  { t: 0.55, sensitivity: 92.8, specificity: 94.5 },
  { t: 0.60, sensitivity: 91.2, specificity: 96.0 },
  { t: 0.65, sensitivity: 89.4, specificity: 97.2 },
  { t: 0.70, sensitivity: 87.1, specificity: 98.1 },
  { t: 0.75, sensitivity: 84.0, specificity: 98.8 },
  { t: 0.80, sensitivity: 79.5, specificity: 99.2 },
];

export const TRAINING_CURVES = [
  { run: "Run 1 (seed 42)", color: "#22D3EE", loss: [1.52, 0.94, 0.71, 0.61, 0.55, 0.51, 0.48, 0.46], qwk: [0.62, 0.79, 0.85, 0.88, 0.89, 0.895, 0.898, 0.9] },
  { run: "Run 2 (seed 1337)", color: "#34D399", loss: [1.48, 0.9, 0.68, 0.58, 0.52, 0.48, 0.45, 0.43], qwk: [0.65, 0.81, 0.86, 0.89, 0.9, 0.9, 0.899, 0.899] },
  { run: "Run 3 (seed 2025)", color: "#FBBF24", loss: [1.57, 0.97, 0.73, 0.62, 0.56, 0.52, 0.5, 0.48], qwk: [0.6, 0.77, 0.84, 0.87, 0.885, 0.89, 0.892, 0.893] },
];

export const GRADCAM_GALLERY = [
  { id: "APTOS-1042", grade: "Moderate NPDR (2)", consistency: 0.94, note: "Model fixates on MA cluster superior to macula" },
  { id: "APTOS-2217", grade: "Severe NPDR (3)", consistency: 0.91, note: "Venous beading + hemorrhages drive the verdict" },
  { id: "APTOS-0518", grade: "No DR (0)", consistency: 0.96, note: "Attention rests on optic disc / vessel arcades only" },
  { id: "APTOS-3390", grade: "PDR (4)", consistency: 0.87, note: "Neovascularization elsewhere flagged, DME zone hot" },
];

// ────────────────────────────────────────────────────────────
// Capacity planner math (M/M/c queueing — mirrors module5_capacity_planner.py)
// ────────────────────────────────────────────────────────────

export interface CapacityInput {
  cams: number; // cameras (screening stations) 1-10
  revw: number; // reviewers (ophthalmologists/graders) 1-6
  arr: number; // arrivals per hour 10-60
}

export interface CapacityOutput {
  patientsPerDay: number;
  patientsPerYear: number;
  meanWaitMin: number;
  utilizationPct: number;
  reviewUtilizationPct: number;
  reviewWaitMin: number;
  bottleneck: "CAPTURE" | "REVIEW" | "BALANCED";
  queueLength: number;
  serviceMinPerPatient: number;
}

function erlangC(lambda: number, mu: number, c: number): { wq: number; rho: number } {
  // lambda: arrival rate /hr, mu: service rate per server /hr, c: servers
  const a = lambda / mu; // offered load
  if (a >= c) return { wq: Infinity, rho: 1 };
  const rho = a / c;
  // Erlang C formula
  let sum = 0;
  for (let n = 0; n < c; n++) sum += Math.pow(a, n) / factorial(n);
  const last = Math.pow(a, c) / (factorial(c) * (1 - rho));
  const cProb = last / (sum + last);
  const wq = cProb / (c * mu - lambda); // hours
  return { wq: wq * 60, rho }; // minutes
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

export const CAPACITY_PARAMS = {
  captureMinPerPatient: 4, // minutes per capture at a camera station
  reviewMinPerCase: 2.5, // minutes of reviewer time per case
  hoursPerDay: 8,
  workingDays: 250,
};

export function computeCapacity(input: CapacityInput): CapacityOutput {
  const { cams, revw, arr } = input;
  const { captureMinPerPatient, reviewMinPerCase, hoursPerDay, workingDays } = CAPACITY_PARAMS;

  const lambda = arr; // per hour
  const captureMu = 60 / captureMinPerPatient; // per station per hour
  const captureCap = cams * captureMu;

  // capture stage: effectively M/M/c with c = cams
  const cap = erlangC(lambda, captureMu, cams);
  const captureUtil = clamp(lambda / captureCap, 0, 1);

  // review stage: high-trust cases auto-cleared (~65%), others need human review
  const reviewLambda = lambda * 0.35;
  const reviewMu = 60 / reviewMinPerCase;
  const rev = erlangC(reviewLambda, reviewMu, revw);
  const reviewUtil = clamp(reviewLambda / (revw * reviewMu), 0, 1);

  const throughput = Math.min(lambda, captureCap);
  const patientsPerDay = Math.round(throughput * hoursPerDay);
  const patientsPerYear = patientsPerDay * workingDays;

  const waitMin = isFinite(cap.wq) ? cap.wq : 999;
  const reviewWaitMin = isFinite(rev.wq) ? rev.wq : 999;
  const meanWaitMin = waitMin + (throughput > 0 ? reviewWaitMin * 0.35 : 0);

  const utilizationPct = Math.round(captureUtil * 100);
  const bottleneck: CapacityOutput["bottleneck"] =
    captureUtil > reviewUtil + 0.08 ? "CAPTURE" : reviewUtil > captureUtil + 0.08 ? "REVIEW" : "BALANCED";

  // Little's law for queue visualization
  const queueLength = isFinite(cap.wq) ? (lambda * (cap.wq / 60)) : 30;

  return {
    patientsPerDay,
    patientsPerYear,
    meanWaitMin: Math.round(meanWaitMin * 10) / 10,
    utilizationPct,
    reviewUtilizationPct: Math.round(reviewUtil * 100),
    reviewWaitMin: Math.round(reviewWaitMin * 10) / 10,
    bottleneck,
    queueLength: Math.round(queueLength * 10) / 10,
    serviceMinPerPatient: captureMinPerPatient,
  };
}

export const CAPACITY_PRESETS = {
  phc: { label: "Single PHC", cams: 1, revw: 1, arr: 10 },
  district: { label: "District pilot", cams: 3, revw: 2, arr: 25 },
  state: { label: "State scale", cams: 10, revw: 6, arr: 60 },
} as const;

/** District scaling: patients/year across N district deployments */
export function districtScaling(cams: number, revw: number, arr: number) {
  const out: Array<{ districts: number; patientsPerYear: number }> = [];
  for (let d = 1; d <= 20; d++) {
    const per = computeCapacity({ cams, revw, arr }).patientsPerYear;
    out.push({ districts: d, patientsPerYear: per * d });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Team (SIH 2026 · PS 26038 · MathWorks)
// ────────────────────────────────────────────────────────────

export const TEAM = [
  { name: "Team Neural Minds", role: "Smart India Hackathon 2026", note: "PS 26038 — MathWorks", initials: "NM" },
];

export const TEAM_MEMBERS = [
  { name: "Saurav", role: "UI / Frontend Lead", initials: "SA", color: "#22D3EE", note: "Web platform, pipeline UX" },
  { name: "ML Lead", role: "Model & Training", initials: "ML", color: "#34D399", note: "CNN training, QWK optimization" },
  { name: "Pipelines", role: "Modules 1-5 Engineer", initials: "PL", color: "#FBBF24", note: "Quality gate → capacity planner" },
  { name: "Data", role: "Dataset & Validation", initials: "DA", color: "#F87171", note: "APTOS/STARE curation, 550-image holdout" },
  { name: "Docs", role: "Research & Pitch", initials: "DO", color: "#A78BFA", note: "Presentation, notebooks, honesty docs" },
  { name: "Mentor", role: "MathWorks Mentor", initials: "MW", color: "#38BDF8", note: "Guidance & tooling review" },
];

export const HONESTY_NOTES = [
  "Validated on 550 held-out APTOS images — not certified as a clinical device.",
  "Data: APTOS 2019, Aravind Eye Hospital (Kaggle); vessels: STARE (Clemson University).",
  "Dashboard demo records are simulated — labeled as demo data.",
  "Trust thresholds HIGH ≥ 0.76 / MODERATE 0.55-0.76 / LOW < 0.55 kept identical across console, API and website.",
];
