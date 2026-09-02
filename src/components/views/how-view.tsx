"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Camera,
  Cpu,
  Database,
  FileCheck2,
  FlaskConical,
  Microscope,
  Network,
  Scale,
  ScanSearch,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { GlassCard, Reveal, SectionHeading } from "@/components/drishti/primitives";
import { ConfBar, ScoreDial } from "@/components/drishti/score-dial";
import { RetinaView } from "@/components/drishti/retina-view";
import { useNav } from "@/components/drishti/shell";
import { ICDR_CLASSES, TRUST_THRESHOLDS } from "@/lib/drishti";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
   Module registry
   ──────────────────────────────────────────────────────────── */

interface ModuleDef {
  id: number;
  label: string;
  icon: LucideIcon;
  copy: string;
}

const MODULES: ModuleDef[] = [
  {
    id: 1,
    label: "Trust Gate",
    icon: ShieldCheck,
    copy: "Every capture is graded for quality BEFORE any AI runs. Blur, illumination and field coverage must pass.",
  },
  {
    id: 2,
    label: "Evidence Engine",
    icon: Microscope,
    copy: "A vessel-aware detector counts microaneurysms, hemorrhages and exudates — and checks exudate distance to the fovea (DME risk).",
  },
  {
    id: 3,
    label: "CNN Grading — ICDR 0–4",
    icon: BrainCircuit,
    copy: "The classifier outputs all five ICDR classes with calibrated confidence — referable = Level 2 or worse.",
  },
  {
    id: 4,
    label: "Grad-CAM + Consistency",
    icon: ScanSearch,
    copy: "Grad-CAM shows WHERE the model looked — and a cross-mask consistency check verifies the attention is stable before we trust it.",
  },
  {
    id: 5,
    label: "Capacity & Trust Routing",
    icon: Users,
    copy: "Trust decides routing: HIGH auto-clears, MODERATE waits for a doctor, LOW/urgent jumps the queue — and the planner sizes camps so the queue stays short.",
  },
];

const IMPLEMENTATION_STAGES = [
  {
    number: "01",
    title: "Acquire and gate",
    input: "Portable fundus-camera frame",
    method: "Laplacian focus, illumination-grid, field-of-view and fill-ratio checks. Borderline frames are rescued with CLAHE, normalization and denoising; ungradeable frames get recapture feedback.",
    output: "Accepted, enhanced or rejected image",
    tool: "MATLAB Image Processing Toolbox · module1_quality_gate.m",
    icon: Camera,
    tone: "#22D3EE",
  },
  {
    number: "02",
    title: "Extract clinical evidence",
    input: "Quality-approved retina",
    method: "Vessel segmentation plus optic-disc and fovea localization. Multi-scale filters and adaptive lesion thresholds surface microaneurysms, hemorrhages, exudates and neovascularisation, including DME risk near the fovea.",
    output: "Lesion counts, masks, landmarks and evidence features",
    tool: "Computer Vision Toolbox · Medical Imaging Toolbox · module2_evidence_engine.m",
    icon: Microscope,
    tone: "#34D399",
  },
  {
    number: "03",
    title: "Grade on ICDR 0–4",
    input: "Image plus structured evidence",
    method: "A class-balanced ResNet transfer-learning model produces calibrated probabilities for No DR, Mild, Moderate, Severe and Proliferative DR. Level 2+ is the referable threshold.",
    output: "Five-class grade and confidence",
    tool: "Deep Learning Toolbox · module3_train_resnet.m",
    icon: BrainCircuit,
    tone: "#FBBF24",
  },
  {
    number: "04",
    title: "Explain and challenge",
    input: "Grade, lesions and model activations",
    method: "Grad-CAM highlights the regions supporting the grade. Independent image-half masks are compared using centroid distance, region overlap and evidence agreement; unstable explanations lower trust.",
    output: "Annotated evidence report and consistency score",
    tool: "Deep Learning Toolbox · Statistics and Machine Learning Toolbox · module4_explainability.m",
    icon: ScanSearch,
    tone: "#FB923C",
  },
  {
    number: "05",
    title: "Route at district scale",
    input: "Trust score, severity and DME flag",
    method: "HIGH cases can auto-clear, MODERATE cases enter doctor review, and LOW or urgent cases jump the queue. SimEvents models cameras, reviewers, arrivals, service time, throughput and queue pressure.",
    output: "Referral route, audit record and capacity decision",
    tool: "Simulink + SimEvents · module5_build_simulink.m",
    icon: Workflow,
    tone: "#F87171",
  },
] as const;

const TOOLBOXES = [
  ["Image Processing Toolbox", "CLAHE, illumination normalization, denoising and quality measurements", FlaskConical],
  ["Computer Vision Toolbox", "Fundus geometry, vessel masks and lesion morphology", Network],
  ["Deep Learning Toolbox", "ResNet training, inference and Grad-CAM activations", BrainCircuit],
  ["Medical Imaging Toolbox", "Clinical image handling, landmarks and annotations", Microscope],
  ["Statistics and Machine Learning Toolbox", "Calibration, threshold policy and validation metrics", Scale],
  ["Simulink + SimEvents", "Acquisition, bandwidth, service capacity and district queues", Workflow],
] as const;

const DATASETS = [
  ["APTOS 2019", "Primary DR grading benchmark and the 550-image held-out validation view"],
  ["IDRiD", "Indian lesion-level annotations for evidence and DME-focused evaluation"],
  ["DRIVE", "Vessel extraction benchmark for retinal-structure segmentation"],
  ["Messidor-2", "External robustness check across a separate clinical image source"],
] as const;

/* ────────────────────────────────────────────────────────────
   Module frame — scroll-driven "lights up" card
   ──────────────────────────────────────────────────────────── */

function ModuleFrame({
  module,
  onActivate,
  children,
}: {
  module: ModuleDef;
  onActivate: (n: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-30% 0px -30% 0px" });
  const Icon = module.icon;

  useEffect(() => {
    if (inView) onActivate(module.id);
  }, [inView, module.id, onActivate]);

  return (
    <motion.article
      id={`module-${module.id}`}
      ref={ref}
      initial={false}
      animate={{
        opacity: inView ? 1 : 0.6,
        borderColor: inView ? "rgba(34,211,238,0.45)" : "rgba(148,197,222,0.12)",
      }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="glass-card scroll-mt-28 p-6 sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#22D3EE]/25 bg-[#22D3EE]/10 transition-all duration-300 ease-out"
            style={{
              color: inView ? "#22D3EE" : "rgba(34,211,238,0.55)",
              boxShadow: inView ? "0 0 22px rgba(34,211,238,0.45)" : "0 0 0 rgba(34,211,238,0)",
            }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">{module.label}</h3>
        </div>
        <span aria-hidden="true" className="tabular select-none font-display text-5xl font-bold leading-none text-[#22D3EE]/10">
          {`0${module.id}`}
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{module.copy}</p>

      <div className="mt-6">{children}</div>
    </motion.article>
  );
}

/* ────────────────────────────────────────────────────────────
   Sticky rail — mini stepper (desktop)
   ──────────────────────────────────────────────────────────── */

function ModuleRail({ active, onSelect }: { active: number; onSelect: (n: number) => void }) {
  return (
    <nav aria-label="Pipeline modules" className="hidden self-start lg:sticky lg:top-28 lg:block">
      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">The pipeline</p>
      <ol className="space-y-1 border-l border-white/10">
        {MODULES.map((m) => {
          const on = active === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-300 ease-out",
                  on
                    ? "bg-[#22D3EE]/[0.07] text-[#22D3EE]"
                    : "text-muted-foreground hover:bg-white/3 hover:text-foreground"
                )}
              >
                <span className={cn("tabular font-display text-xs", on ? "text-[#22D3EE]" : "text-muted-foreground/60")}>
                  {`0${m.id}`}
                </span>
                <span className="font-medium">{m.label}</span>
                {on && (
                  <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-[#22D3EE] shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 px-3 text-xs leading-relaxed text-muted-foreground">
        Each module lights up as it enters view. Click to jump.
      </p>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────
   Module 1 — Trust Gate (blur slider → quality dial)
   ──────────────────────────────────────────────────────────── */

function TrustGateDemo() {
  const [blur, setBlur] = useState(18);
  const quality = 0.95 - (blur / 100) * 0.65;

  const verdict =
    quality >= TRUST_THRESHOLDS.HIGH
      ? { label: "Gate pass", cls: "border-[#34D399]/40 text-[#34D399]" }
      : quality >= TRUST_THRESHOLDS.MODERATE_LOW
        ? { label: "Borderline", cls: "border-[#FBBF24]/40 text-[#FBBF24]" }
        : { label: "Recapture required", cls: "border-[#F87171]/40 text-[#F87171]" };

  return (
    <div className="grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <RetinaView severity={0} blur={(blur / 100) * 0.9} className="mx-auto aspect-square w-full max-w-55 md:mx-0" />
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <ScoreDial value={quality} size={128} label="Quality" sublabel="trust gate" tone="auto" />
          <div className="space-y-2">
            <span className={cn("chip", verdict.cls)}>{verdict.label}</span>
            <p className="text-xs text-muted-foreground">
              Blur <span className="tabular text-foreground">{blur}%</span> · gate floor{" "}
              <span className="tabular">{TRUST_THRESHOLDS.MODERATE_LOW.toFixed(2)}</span>
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Slider
            value={[blur]}
            onValueChange={(v) => setBlur(v[0] ?? 0)}
            min={0}
            max={100}
            step={1}
            aria-label="Capture blur"
            className="max-w-md"
          />
          <p className="text-xs italic text-muted-foreground">Slide the blur — watch trust drop live.</p>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Module 2 — Evidence Engine (layer toggles + live counts)
   ──────────────────────────────────────────────────────────── */

type LayerKey = "vessels" | "ma" | "hem" | "ex" | "dme";

const LAYER_META: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: "vessels", label: "Vessels", color: "#22D3EE" },
  { key: "ma", label: "Microaneurysms", color: "#E0331F" },
  { key: "hem", label: "Hemorrhages", color: "#DC2626" },
  { key: "ex", label: "Exudates", color: "#F2D66C" },
  { key: "dme", label: "DME zone", color: "#FBBF24" },
];

const LESION_COUNTS: Array<{ key: LayerKey; label: string; n: number }> = [
  { key: "ma", label: "MA", n: 58 },
  { key: "hem", label: "HEM", n: 16 },
  { key: "ex", label: "EX", n: 9 },
];

function EvidenceDemo() {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    vessels: true,
    ma: true,
    hem: true,
    ex: true,
    dme: false,
  });

  return (
    <div className="grid items-center gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <RetinaView
        severity={3}
        dmeRisk={false}
        layers={{ ...layers, gradcam: false }}
        className="mx-auto aspect-square w-full max-w-60 md:mx-0"
      />
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          {LAYER_META.map((l) => {
            const on = layers[l.key];
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={on}
                onClick={() => setLayers((p) => ({ ...p, [l.key]: !p[l.key] }))}
                className={cn(
                  "chip cursor-pointer transition-all duration-300 ease-out",
                  on ? "bg-white/4" : "border-white/10 text-muted-foreground opacity-55 hover:opacity-80"
                )}
                style={on ? { borderColor: `${l.color}66`, color: l.color } : undefined}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: on ? l.color : "rgba(255,255,255,0.25)" }}
                />
                {l.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {LESION_COUNTS.map((c) => (
            <span
              key={c.key}
              className={cn(
                "chip tabular transition-opacity duration-300",
                layers[c.key] ? "border-[#22D3EE]/30 text-foreground" : "opacity-40"
              )}
            >
              {c.label} {c.n}
            </span>
          ))}
          <span className="chip border-white/10 text-muted-foreground">vessel density 38%</span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Toggle layers to see what the detector sees. Exudates creeping toward the fovea flag{" "}
          <span className="text-[#FBBF24]">DME risk</span> — a referral trigger independent of the DR grade.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Module 3 — CNN Grading (5-class buttons → ConfBars)
   ──────────────────────────────────────────────────────────── */

const CLASS_DIST: number[][] = [
  [0.97, 0.02, 0.005, 0.003, 0.002],
  [0.06, 0.91, 0.021, 0.005, 0.004],
  [0.27, 0.012, 0.658, 0.043, 0.017],
  [0.004, 0.011, 0.063, 0.842, 0.08],
  [0.02, 0.01, 0.05, 0.14, 0.78],
];

function GradingDemo() {
  const [sel, setSel] = useState(2);
  const dist = CLASS_DIST[sel];
  const cls = ICDR_CLASSES[sel];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {ICDR_CLASSES.map((c) => {
          const on = sel === c.level;
          return (
            <button
              key={c.level}
              type="button"
              aria-pressed={on}
              onClick={() => setSel(c.level)}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-300 ease-out",
                on ? "bg-white/4" : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground"
              )}
              style={on ? { borderColor: `${c.color}88`, color: c.color, boxShadow: `0 0 14px ${c.color}33` } : undefined}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="max-w-md space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Softmax over 5 ICDR classes</p>
        {ICDR_CLASSES.map((c, i) => (
          <ConfBar key={`${sel}-${i}`} label={c.short} value={dist[i]} color={c.color} active={i === sel} delay={i * 70} />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Prediction: <span className="font-semibold" style={{ color: cls.color }}>{cls.short}</span>
        {" · "}
        {sel >= 2 ? <span className="font-medium text-[#FBBF24]">Referable</span> : <span className="font-medium text-[#34D399]">Non-referable</span>}
        {" · "}
        {cls.action}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Module 4 — Grad-CAM fade + consistency dial
   ──────────────────────────────────────────────────────────── */

function GradcamDemo() {
  const [cam, setCam] = useState(true);

  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-70 md:mx-0">
        <RetinaView
          severity={3}
          dmeRisk
          layers={{ vessels: true, ma: true, hem: true, ex: true, dme: true, gradcam: false }}
          className="absolute inset-0 h-full w-full"
        />
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: cam ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <RetinaView
            severity={3}
            dmeRisk
            layers={{ vessels: false, ma: false, hem: false, ex: false, dme: false, gradcam: true }}
            className="h-full w-full"
          />
        </motion.div>
      </div>

      <div className="min-w-0 space-y-5">
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm">
          <Switch checked={cam} onCheckedChange={setCam} aria-label="Toggle Grad-CAM heatmap" />
          <span>Grad-CAM heatmap</span>
        </label>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <ScoreDial value={0.903} size={128} decimals={3} label="Consistency" sublabel="cross-mask" />
          <div className="flex flex-col items-start gap-2">
            <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">
              <span className="tabular">centroid Δ 0.41 DD</span>
            </span>
            <span className="chip border-[#34D399]/30 text-[#34D399]">
              <span className="tabular">overlap 88%</span>
            </span>
          </div>
        </div>

        <p className="text-xs italic leading-relaxed text-muted-foreground">
          The heatmap must agree with itself across two independent image halves before DRISHTI trusts the grade.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Module 5 — Capacity & Trust Routing (animated clinic queue)
   ──────────────────────────────────────────────────────────── */

interface QueueDot {
  id: string;
  color: string;
  finalTop: string;
  delay: number;
  duration: number;
}

const QUEUE_DOTS: QueueDot[] = [
  { id: "g1", color: "#34D399", finalTop: "16%", delay: 0, duration: 7 },
  { id: "g2", color: "#34D399", finalTop: "16%", delay: 2.4, duration: 7 },
  { id: "g3", color: "#34D399", finalTop: "16%", delay: 4.8, duration: 7 },
  { id: "a1", color: "#FBBF24", finalTop: "44%", delay: 1.2, duration: 7 },
  { id: "a2", color: "#FBBF24", finalTop: "58%", delay: 3.6, duration: 7 },
  { id: "r1", color: "#F87171", finalTop: "84%", delay: 0.6, duration: 4.6 },
];

function QueueDotEl({ dot, reduced }: { dot: QueueDot; reduced: boolean }) {
  if (reduced) {
    return (
      <span
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: "88%", top: dot.finalTop, backgroundColor: dot.color, boxShadow: `0 0 8px ${dot.color}99` }}
      />
    );
  }
  return (
    <motion.span
      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
      animate={{
        left: ["7%", "30%", "55%", "88%", "88%"],
        top: ["50%", "50%", "50%", dot.finalTop, dot.finalTop],
        opacity: [0, 1, 1, 1, 0],
        backgroundColor: ["#22D3EE", "#22D3EE", dot.color, dot.color],
        boxShadow: [
          "0 0 10px rgba(34,211,238,0.6)",
          "0 0 10px rgba(34,211,238,0.6)",
          `0 0 10px ${dot.color}99`,
          `0 0 10px ${dot.color}99`,
        ],
      }}
      transition={{
        duration: dot.duration,
        delay: dot.delay,
        repeat: Infinity,
        ease: "easeInOut",
        times: [0, 0.45, 0.62, 0.88, 1],
        opacity: { duration: dot.duration, delay: dot.delay, repeat: Infinity, ease: "linear", times: [0, 0.06, 0.85, 0.93, 1] },
        backgroundColor: { duration: dot.duration, delay: dot.delay, repeat: Infinity, ease: "linear", times: [0, 0.55, 0.78, 1] },
        boxShadow: { duration: dot.duration, delay: dot.delay, repeat: Infinity, ease: "linear", times: [0, 0.55, 0.78, 1] },
      }}
    />
  );
}

function RoutingDemo() {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="space-y-4">
      <div
        aria-hidden="true"
        className="relative h-60 w-full overflow-hidden rounded-xl border border-[#22D3EE]/15 bg-[#04121c]/50 sm:h-64"
      >
        {/* routing rails */}
        <div className="absolute left-[10%] right-[36%] top-1/2 border-t border-dashed border-[#22D3EE]/20" />
        <div className="absolute left-[55%] top-[16%] h-[68%] border-l border-dashed border-[#22D3EE]/20" />
        <div className="absolute left-[55%] right-[36%] top-[16%] border-t border-dashed border-[#22D3EE]/10" />
        <div className="absolute left-[55%] right-[36%] top-[84%] border-t border-dashed border-[#22D3EE]/10" />

        {/* capture */}
        <div className="absolute left-0 top-1/2 flex h-16 w-16 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/3 sm:h-20 sm:w-20">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Capture</span>
        </div>

        {/* pipeline */}
        <div className="absolute left-[20%] top-1/2 flex h-20 w-24 -translate-y-1/2 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-[#22D3EE]/40 bg-[#22D3EE]/6 shadow-[0_0_18px_rgba(34,211,238,0.15)] sm:w-28">
          <span className="scanline" />
          <Cpu className="h-4 w-4 text-[#22D3EE]" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[#22D3EE]">DRISHTI</span>
          <span className="text-[8px] text-muted-foreground">gate → grade → trust</span>
        </div>

        {/* outcomes */}
        <div className="absolute right-0 flex w-28 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#34D399]/35 bg-[#34D399]/5 sm:w-36" style={{ top: "4%", height: "24%" }}>
          <span className="text-[10px] font-semibold text-[#34D399]">Auto-cleared</span>
          <span className="text-[8px] uppercase tracking-widest text-muted-foreground">trust HIGH</span>
        </div>
        <div className="absolute right-0 flex w-28 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#FBBF24]/35 bg-[#FBBF24]/5 sm:w-36" style={{ top: "35%", height: "30%" }}>
          <span className="absolute -left-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#FBBF24]/60 bg-[#2A2210] text-[11px] font-bold tabular text-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.35)]">
            2
          </span>
          <span className="text-[10px] font-semibold text-[#FBBF24]">Doctor review</span>
          <span className="text-[8px] uppercase tracking-widest text-muted-foreground">trust MODERATE</span>
        </div>
        <div className="absolute right-0 flex w-28 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#F87171]/35 bg-[#F87171]/5 sm:w-36" style={{ bottom: "4%", height: "24%" }}>
          <span className="text-[10px] font-semibold text-[#F87171]">Urgent referral</span>
          <span className="text-[8px] uppercase tracking-widest text-muted-foreground">jumps the queue</span>
        </div>

        {/* patient dots */}
        {QUEUE_DOTS.map((d) => (
          <QueueDotEl key={d.id} dot={d} reduced={reduced} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="chip border-[#FBBF24]/30 text-[#FBBF24]">35% need human review</span>
        <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">
          <span className="tabular">≈2.5 min</span> reviewer time per case
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        HIGH auto-clears · MODERATE waits for a doctor · LOW / urgent jumps the queue. Demo loop — six patients, three
        routes. The capacity planner sizes camps so the review lane never floods.
      </p>
    </div>
  );
}

function ImplementationSection() {
  const { navigate } = useNav();

  return (
    <Reveal className="mt-20 sm:mt-28">
      <SectionHeading
        eyebrow="PS 26038 IMPLEMENTATION"
        title="From camera frame to accountable referral."
        sub="The interactive cards above show the decision logic. This is the portable Python and MATLAB/Simulink implementation behind it."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {IMPLEMENTATION_STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <GlassCard key={stage.number} className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                  style={{ color: stage.tone, borderColor: `${stage.tone}55`, backgroundColor: `${stage.tone}12` }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-display text-xs font-semibold" style={{ color: stage.tone }}>
                      {stage.number}
                    </span>
                    <h3 className="font-display text-lg font-bold">{stage.title}</h3>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{stage.method}</p>
                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                    <p className="rounded-lg border border-white/10 bg-white/2 p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Input</span>
                      <span className="mt-1 block text-foreground/90">{stage.input}</span>
                    </p>
                    <p className="rounded-lg border border-white/10 bg-white/2 p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Output</span>
                      <span className="mt-1 block text-foreground/90">{stage.output}</span>
                    </p>
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: stage.tone }} />
                    {stage.tool}
                  </p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[#22D3EE]" />
            <h3 className="font-display text-xl font-bold">Datasets and validation path</h3>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {DATASETS.map(([name, use]) => (
              <div key={name} className="border-l-2 border-[#22D3EE]/35 pl-3">
                <p className="font-display text-sm font-semibold text-[#22D3EE]">{name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{use}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Current MATLAB validation: <span className="text-foreground">87.0% sensitivity · 94.5% specificity · QWK 0.8766</span> on 550 held-out APTOS images. These figures describe the research prototype, not a certified clinical device.
          </p>
          <button
            type="button"
            onClick={() => navigate("validation")}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#22D3EE]/30 px-4 py-2 text-sm font-semibold text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
          >
            Inspect validation evidence
            <ArrowRight className="h-4 w-4" />
          </button>
        </GlassCard>

        <GlassCard className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-[#FBBF24]" />
            <h3 className="font-display text-xl font-bold">Simulink deployment twin</h3>
          </div>
          <div className="mt-5 space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="border-l-2 border-[#FBBF24]/50 pl-3">Camera acquisition → bandwidth-aware transfer → quality gate → AI service → doctor review.</p>
            <p className="border-l-2 border-[#FBBF24]/50 pl-3">The SimEvents model varies cameras, reviewers, arrivals per hour and service time to expose queue overload before a district rollout.</p>
            <p className="border-l-2 border-[#34D399]/50 pl-3">The live planner below is the browser-side capacity twin; `module5_build_simulink.m` builds the MathWorks model for simulation.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("capacity")}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#FBBF24]/30 px-4 py-2 text-sm font-semibold text-[#FBBF24] transition-colors hover:bg-[#FBBF24]/10"
          >
            Open capacity planner
            <ArrowRight className="h-4 w-4" />
          </button>
        </GlassCard>
      </div>

      <GlassCard className="mt-4 p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-[#22D3EE]" />
          <h3 className="font-display text-xl font-bold">Toolbox map</h3>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLBOXES.map(([name, role, Icon]) => (
            <div key={name} className="flex gap-3 rounded-lg border border-white/10 bg-white/2 p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
              <div>
                <p className="text-xs font-semibold text-foreground/90">{name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{role}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#34D399]" />
          The web console is the judge-facing interface. FastAPI selects MATLAB Engine when connected, otherwise the portable Python pipeline, then an offline demo fallback. The active engine is reported by `GET /api/matlab_status`.
        </p>
      </GlassCard>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────
   "What makes us different" — the Consistency Check
   ──────────────────────────────────────────────────────────── */

const DIFFERENTIATORS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: ShieldCheck, text: "Quality gate before AI" },
  { icon: Microscope, text: "Evidence before grade" },
  { icon: ScanSearch, text: "Explainability that must prove stability" },
  {
    icon: Scale,
    text: `Routing thresholds identical everywhere (${TRUST_THRESHOLDS.HIGH.toFixed(2)} / ${TRUST_THRESHOLDS.MODERATE_LOW.toFixed(2)})`,
  },
];

function ConsistencySection() {
  return (
    <Reveal className="mt-20 sm:mt-28">
      <GlassCard className="relative overflow-hidden border-[#22D3EE]/35 p-8 shadow-[0_0_60px_rgba(34,211,238,0.12)] sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#22D3EE]/10 blur-3xl" />

        <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">The consistency check</span>
        <h3 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">What makes us different</h3>

        <div className="mt-8 grid items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)]">
          {/* diagram: two half-retinas → consistency dial */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative h-28 w-28 sm:h-36 sm:w-36">
                <div className="absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)" }}>
                  <RetinaView
                    severity={3}
                    dmeRisk
                    layers={{ vessels: true, ma: true, hem: true, ex: true, dme: true, gradcam: true }}
                    gradcam={{ cx: 0.34, cy: 0.4, rx: 0.11, ry: 0.1, intensity: 0.8 }}
                    className="h-full w-full"
                  />
                </div>
                <div className="absolute inset-0" style={{ clipPath: "inset(0 0 0 50%)" }}>
                  <RetinaView
                    severity={3}
                    dmeRisk
                    layers={{ vessels: true, ma: true, hem: true, ex: true, dme: true, gradcam: true }}
                    gradcam={{ cx: 0.62, cy: 0.56, rx: 0.15, ry: 0.14, intensity: 0.9 }}
                    className="h-full w-full"
                  />
                </div>
                <div aria-hidden="true" className="absolute inset-y-0 left-1/2 border-l border-dashed border-[#22D3EE]/50" />
                <span className="absolute bottom-1 left-2 text-[9px] uppercase tracking-widest text-[#22D3EE]/80">half A</span>
                <span className="absolute bottom-1 right-2 text-[9px] uppercase tracking-widest text-[#22D3EE]/80">half B</span>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-[#22D3EE]" />
              <ScoreDial value={0.903} size={110} decimals={3} label="Consistency" sublabel="cross-mask" />
            </div>
            <p className="text-xs text-muted-foreground">Two independent image halves · attention must agree</p>
          </div>

          <div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Most screening CNNs stop at a confidence number. DRISHTI interrogates its own explanation: Grad-CAM runs on
              two independent image halves — if the attention centroid drifts or the regions barely overlap, the
              explanation is unstable, and the case routes to a human no matter how confident the grade looks. That&apos;s
              the difference between a black box and an accountable one.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {DIFFERENTIATORS.map((b) => (
                <li key={b.text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/25 bg-[#22D3EE]/10 text-[#22D3EE]">
                    <b.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-foreground/90">{b.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </GlassCard>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────
   Bottom CTA
   ──────────────────────────────────────────────────────────── */

function LaunchCta() {
  const { navigate } = useNav();
  return (
    <Reveal className="mt-16 sm:mt-24">
      <div className="glass-card glass-card-hover relative overflow-hidden p-8 text-center sm:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-72 rounded-full bg-[#22D3EE]/10 blur-3xl" />
        <h3 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">See it run on a real case</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Launch the screening app and watch all five modules fire on a demo case — quality gate, evidence, grading,
          Grad-CAM and trust routing, in about six seconds.
        </p>
        <button
          type="button"
          onClick={() => navigate("screening")}
          className="btn-glow-cyan mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#22D3EE] px-6 py-3 font-display text-sm font-semibold text-[#04121c] transition-all"
        >
          Launch Screening
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────
   View
   ──────────────────────────────────────────────────────────── */

export default function HowView() {
  const [active, setActive] = useState(1);

  const handleActivate = useCallback((n: number) => setActive(n), []);

  const scrollToModule = useCallback((n: number) => {
    document.getElementById(`module-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="HOW IT WORKS"
        title="Five modules. One honest verdict."
        sub="Scroll through the pipeline — every module has a live demo."
      />

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        <ModuleRail active={active} onSelect={scrollToModule} />

        <div className="min-w-0 space-y-10 sm:space-y-14">
          {MODULES.map((m) => (
            <Reveal key={m.id}>
              <ModuleFrame module={m} onActivate={handleActivate}>
                {m.id === 1 && <TrustGateDemo />}
                {m.id === 2 && <EvidenceDemo />}
                {m.id === 3 && <GradingDemo />}
                {m.id === 4 && <GradcamDemo />}
                {m.id === 5 && <RoutingDemo />}
              </ModuleFrame>
            </Reveal>
          ))}
        </div>
      </div>

      <ImplementationSection />
      <ConsistencySection />
      <LaunchCta />
    </section>
  );
}
