"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Gauge,
  Scale,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { AnimatedNumber } from "@/components/drishti/animated-number";
import { GlassCard, Reveal, SectionHeading } from "@/components/drishti/primitives";
import { Slider } from "@/components/ui/slider";
import {
  CAPACITY_PARAMS,
  CAPACITY_PRESETS,
  computeCapacity,
  districtScaling,
  type CapacityOutput,
} from "@/lib/drishti";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Capacity Planner — PAGE 6
// Local M/M/c math (same lib the API route uses) gives instant
// feedback; GET /api/capacity hydrates the canonical numbers.
// ────────────────────────────────────────────────────────────

const CYAN = "#22D3EE";
const GREEN = "#34D399";
const AMBER = "#FBBF24";
const RED = "#F87171";
const AXIS = "#8296B3";

/** API returns 999 min when the queue is infinite (wq → ∞). */
const UNBOUNDED_WAIT = 900;

type ScalingPoint = { districts: number; patientsPerYear: number };
type PresetKey = keyof typeof CAPACITY_PRESETS;
type Tone = { text: string; chip: string };

interface CapacityApiPayload {
  output: CapacityOutput;
  scaling: ScalingPoint[];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** Trust-color load scale: green ≤75 · amber 75–90 · red >90. */
function loadTone(pct: number): Tone {
  if (pct > 90) return { text: "text-[#F87171] text-glow-red", chip: "border-[#F87171]/40 text-[#F87171]" };
  if (pct > 75) return { text: "text-[#FBBF24]", chip: "border-[#FBBF24]/40 text-[#FBBF24]" };
  return { text: "text-[#34D399]", chip: "border-[#34D399]/40 text-[#34D399]" };
}

/** Wait scale: green ≤15 min · amber >30 · red >60 (or unbounded). */
function waitTone(min: number): Tone {
  if (min >= UNBOUNDED_WAIT || min > 60)
    return { text: "text-[#F87171] text-glow-red", chip: "border-[#F87171]/40 text-[#F87171]" };
  if (min > 30) return { text: "text-[#FBBF24]", chip: "border-[#FBBF24]/40 text-[#FBBF24]" };
  if (min <= 15) return { text: "text-[#34D399]", chip: "border-[#34D399]/40 text-[#34D399]" };
  return { text: "text-[#22D3EE]", chip: "border-[#22D3EE]/40 text-[#22D3EE]" };
}

/** Decorative flow dots — travel left → right, speed set by `duration`. */
function FlowDots({
  count,
  duration,
  color,
  reduced,
}: {
  count: number;
  duration: number;
  color: string;
  reduced: boolean;
}) {
  const dots = Array.from({ length: count }, (_, i) => i);
  if (reduced) {
    return (
      <>
        {dots.map((i) => (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{
              top: "calc(50% - 3px)",
              left: `${count > 1 ? 8 + (i * 84) / (count - 1) : 46}%`,
              background: color,
              opacity: 0.55,
            }}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {dots.map((i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ top: "calc(50% - 3px)", background: color, boxShadow: `0 0 8px ${color}` }}
          initial={{ left: "-3%" }}
          animate={{ left: "103%" }}
          transition={{ duration, repeat: Infinity, ease: "linear", delay: (i * duration) / count }}
        />
      ))}
    </>
  );
}

/** Slider row: label + hint, big tabular value chip, shadcn slider. */
function Knob({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  onDragStart,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onDragStart: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="tabular shrink-0 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2.5 py-1 font-display text-xl font-bold leading-none text-[#22D3EE]">
          {value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        onPointerDown={onDragStart}
        aria-label={label}
        className="[&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-[#22D3EE] [&_[data-slot=slider-thumb]]:shadow-[0_0_12px_rgba(34,211,238,0.45)]"
      />
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-muted-foreground">
        <span className="tabular">{min}</span>
        <span className="tabular">{max}</span>
      </div>
    </div>
  );
}

/** Dark recharts tooltip for the scaling chart. */
function ScalingTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: string | number }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-lg border border-[#22D3EE]/25 bg-[#081120]/95 px-3 py-2 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
      <div className="font-display font-semibold text-[#E6F1FF]">
        {label} district{Number(label) === 1 ? "" : "s"}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: CYAN }} />
        <span className="text-muted-foreground">Patients / year</span>
        <span className="tabular font-medium text-[#E6F1FF]">{v.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// View
// ────────────────────────────────────────────────────────────

export default function CapacityView() {
  // Knobs — defaults mirror the "District pilot" preset.
  const [cams, setCams] = useState(3);
  const [revw, setRevw] = useState(2);
  const [arr, setArr] = useState(25);
  const [dragging, setDragging] = useState(false);
  const [remote, setRemote] = useState<{ key: string; payload: CapacityApiPayload } | null>(null);
  const reduce = useReducedMotion() ?? false;

  // Instant local math — same computeCapacity the API route calls server-side.
  const local = useMemo(() => computeCapacity({ cams, revw, arr }), [cams, revw, arr]);
  const localScaling = useMemo(() => districtScaling(cams, revw, arr), [cams, revw, arr]);

  // Show API numbers once they match the current knobs; local math covers the gap.
  const cacheKey = `${cams}-${revw}-${arr}`;
  const out = remote && remote.key === cacheKey ? remote.payload.output : local;
  const scaling = remote && remote.key === cacheKey ? remote.payload.scaling : localScaling;

  // Debounced (~150 ms) hydration from GET /api/capacity.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/capacity?cams=${cams}&revw=${revw}&arr=${arr}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/capacity ${res.status}`))))
        .then((json: CapacityApiPayload) => {
          setRemote({ key: `${cams}-${revw}-${arr}`, payload: json });
        })
        .catch(() => {
          /* local math already rendered — keep it */
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cams, revw, arr]);

  // End of drag → AnimatedNumber settles with an eased count-up.
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  // Presets are derived: moving a knob off a preset lands on "Custom".
  const activePreset = (Object.keys(CAPACITY_PRESETS) as PresetKey[]).find(
    (k) => CAPACITY_PRESETS[k].cams === cams && CAPACITY_PRESETS[k].revw === revw && CAPACITY_PRESETS[k].arr === arr
  );
  const applyPreset = (k: PresetKey) => {
    const p = CAPACITY_PRESETS[k];
    setCams(p.cams);
    setRevw(p.revw);
    setArr(p.arr);
  };

  // Derived visual params.
  const overloaded = out.utilizationPct >= 100;
  const arrDur = clamp(75 / arr, 1.2, 4.5); // arrivals flow: faster when arr higher
  const captureCap = cams * (60 / CAPACITY_PARAMS.captureMinPerPatient);
  const flowDur = clamp(75 / Math.min(arr, captureCap), 1.2, 4.5); // downstream: throttled by the bottleneck stage
  const queueDots = Math.min(12, Math.max(0, Math.round(out.queueLength)));
  const to100k = scaling.find((s) => s.patientsPerYear >= 100000) ?? scaling[scaling.length - 1];

  const wait = waitTone(out.meanWaitMin);
  const capTone = loadTone(out.utilizationPct);
  const revTone = loadTone(out.reviewUtilizationPct);
  const revWait = waitTone(out.reviewWaitMin);

  const banner =
    out.bottleneck === "CAPTURE"
      ? { icon: Camera, tone: "amber" as const, msg: "Cameras are the bottleneck — add a station or arrivals pile up" }
      : out.bottleneck === "REVIEW"
        ? { icon: Stethoscope, tone: "amber" as const, msg: "Doctors are the bottleneck — the review queue grows" }
        : { icon: Scale, tone: "green" as const, msg: "Capture and review are balanced" };
  const BannerIcon = banner.icon;
  const bannerCls =
    banner.tone === "amber"
      ? { box: "border-[#FBBF24]/35 bg-[#FBBF24]/[0.06] text-[#FBBF24]", chip: "border-[#FBBF24]/40 text-[#FBBF24]" }
      : { box: "border-[#34D399]/35 bg-[#34D399]/[0.06] text-[#34D399]", chip: "border-[#34D399]/40 text-[#34D399]" };

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading
        eyebrow="PLANNING"
        title="Size the camp before you pitch it"
        sub="Drag the knobs — queueing math answers instantly. The difference between a demo and a district program."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── 1 · Controls ─────────────────────────────────── */}
        <Reveal>
          <GlassCard className="lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-foreground">Camp knobs</h3>
              {!activePreset && <span className="chip border-white/25 text-muted-foreground">Custom</span>}
            </div>

            <div className="mt-5 space-y-5">
              <Knob
                label="Cameras / screening stations"
                hint={`capture · ${CAPACITY_PARAMS.captureMinPerPatient} min per patient`}
                value={cams}
                min={1}
                max={10}
                onChange={setCams}
                onDragStart={() => setDragging(true)}
              />
              <Knob
                label="Reviewers"
                hint={`ophthalmologists / graders · ${CAPACITY_PARAMS.reviewMinPerCase} min per case`}
                value={revw}
                min={1}
                max={6}
                onChange={setRevw}
                onDragStart={() => setDragging(true)}
              />
              <Knob
                label="Arrivals / hour"
                hint="walk-in rate at the camp door"
                value={arr}
                min={10}
                max={60}
                onChange={setArr}
                onDragStart={() => setDragging(true)}
              />
            </div>

            <div className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Presets
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(CAPACITY_PRESETS) as PresetKey[]).map((k) => {
                  const p = CAPACITY_PRESETS[k];
                  const active = activePreset === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => applyPreset(k)}
                      aria-pressed={active}
                      className={cn(
                        "min-h-[52px] rounded-lg border px-1.5 py-2 text-center transition-all duration-200 ease-out",
                        active
                          ? "border-[#22D3EE]/60 bg-[#22D3EE]/10 text-[#22D3EE] shadow-[0_0_16px_rgba(34,211,238,0.18)]"
                          : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-[#22D3EE]/30 hover:text-foreground"
                      )}
                    >
                      <span className="block text-[11px] font-semibold leading-tight">{p.label}</span>
                      <span className="tabular mt-0.5 block text-[10px] opacity-70">
                        {p.cams}·{p.revw}·{p.arr}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 space-y-1.5 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                {CAPACITY_PARAMS.captureMinPerPatient} min capture per patient ·{" "}
                {CAPACITY_PARAMS.reviewMinPerCase} min reviewer time per case · 35% of cases need human review ·{" "}
                {CAPACITY_PARAMS.hoursPerDay} h day · {CAPACITY_PARAMS.workingDays} days/year
              </p>
              <p>M/M/c queueing math — mirrors module5_capacity_planner.py.</p>
            </div>
          </GlassCard>
        </Reveal>

        {/* ── Right column ─────────────────────────────────── */}
        <div className="space-y-6">
          {/* 2 · Live outputs */}
          <Reveal delay={0.05}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <GlassCard className="p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Camera className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
                  Patients / day
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-[#22D3EE] text-glow-cyan sm:text-3xl">
                  <AnimatedNumber value={out.patientsPerDay} startOnVisible={false} duration={dragging ? 0 : 600} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  screened per {CAPACITY_PARAMS.hoursPerDay} h camp day
                </p>
              </GlassCard>

              <GlassCard className="p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
                  Patients / year
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-[#22D3EE] text-glow-cyan sm:text-3xl">
                  <AnimatedNumber value={out.patientsPerYear} startOnVisible={false} duration={dragging ? 0 : 600} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  × {CAPACITY_PARAMS.workingDays} working days / year
                </p>
              </GlassCard>

              <GlassCard className="p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Timer className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
                  Mean wait
                </div>
                <div className={cn("mt-2 font-display text-2xl font-bold sm:text-3xl", wait.text)}>
                  {out.meanWaitMin >= UNBOUNDED_WAIT ? (
                    <span className="tabular">∞</span>
                  ) : (
                    <span className="tabular">
                      {out.meanWaitMin.toFixed(1)}
                      <span className="ml-1 text-sm font-semibold opacity-70">min</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {out.meanWaitMin >= UNBOUNDED_WAIT
                    ? "queue never drains — add capacity"
                    : "capture queue + review wait"}
                </p>
              </GlassCard>

              <GlassCard className="p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
                  Utilization
                </div>
                <div className={cn("mt-2 font-display text-2xl font-bold sm:text-3xl", capTone.text)}>
                  <span className="tabular">
                    {out.utilizationPct}
                    <span className="text-sm font-semibold opacity-70">%</span>
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  reviewers{" "}
                  <span className={cn("tabular font-semibold", revTone.text)}>{out.reviewUtilizationPct}%</span>
                </p>
              </GlassCard>
            </div>
          </Reveal>

          {/* 3 · Animated queue visualization */}
          <Reveal delay={0.1}>
            <GlassCard>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-foreground">Live queue — a day at the camp</h3>
                <span className="chip border-white/15 text-muted-foreground">
                  {arr}/hr · {cams} cam · {revw} rev
                </span>
              </div>

              <div aria-hidden className="mt-4 rounded-xl border border-white/10 bg-[#081120]/50 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:flex-nowrap">
                  {/* arrivals flow — speed tracks the arrivals/hour knob */}
                  <div className="min-w-[88px] flex-1">
                    <p className="mb-1 hidden text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                      Arrivals
                    </p>
                    <div className="relative h-7 overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
                      <FlowDots count={4} duration={arrDur} color={CYAN} reduced={reduce} />
                    </div>
                  </div>

                  <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />

                  {/* camera stations — one small box per camera */}
                  <div className="shrink-0">
                    <p className="mb-1 hidden text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                      Capture ×{cams}
                    </p>
                    <div className="flex max-w-[104px] flex-wrap justify-center gap-1 sm:max-w-[124px]">
                      {Array.from({ length: cams }, (_, i) => (
                        <span
                          key={i}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[#22D3EE]/35 bg-[#22D3EE]/10 shadow-[0_0_10px_rgba(34,211,238,0.12)]"
                        >
                          <Camera className="h-3 w-3 text-[#22D3EE]" />
                        </span>
                      ))}
                    </div>
                  </div>

                  <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />

                  {/* AI pipeline orb */}
                  <div className="shrink-0">
                    <p className="mb-1 hidden text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                      AI gate
                    </p>
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#22D3EE]/50 bg-[#22D3EE]/10">
                      <Sparkles className="h-4 w-4 text-[#22D3EE]" />
                      {!reduce && (
                        <motion.span
                          className="absolute inset-0 rounded-full border border-[#22D3EE]/50"
                          animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                        />
                      )}
                    </span>
                  </div>

                  {/* split: 65% auto-cleared · 35% doctor review */}
                  <div className="order-last min-w-[240px] flex-1 basis-full space-y-2 sm:order-none sm:basis-auto">
                    <div className="flex items-center gap-2">
                      <div className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md border border-[#34D399]/25 bg-[#34D399]/[0.05]">
                        <FlowDots count={3} duration={flowDur} color={GREEN} reduced={reduce} />
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#34D399]/40 bg-[#34D399]/10 px-2 py-1 text-[11px] font-semibold text-[#34D399]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Auto-cleared · 65%
                      </span>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-[#FBBF24]/25 bg-[#FBBF24]/[0.05]">
                        <FlowDots count={2} duration={flowDur} color={AMBER} reduced={reduce} />
                      </div>
                      <div className="flex w-[152px] shrink-0 flex-col justify-center gap-1 rounded-lg border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="h-3.5 w-3.5 shrink-0 text-[#FBBF24]" />
                          <span className="text-[11px] font-semibold text-[#FBBF24]">Doctor review</span>
                          <span className="tabular ml-auto text-[11px] font-bold text-[#FBBF24]">{queueDots}</span>
                        </div>
                        <div className="flex min-h-[6px] flex-wrap items-center gap-1">
                          {queueDots === 0 ? (
                            <span className="text-[10px] text-muted-foreground">queue empty</span>
                          ) : (
                            Array.from({ length: queueDots }, (_, i) => (
                              <motion.span
                                key={i}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: i === 0 ? RED : AMBER }}
                                animate={reduce ? undefined : { opacity: [0.45, 1, 0.45] }}
                                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                              />
                            ))
                          )}
                          {queueDots >= 12 && <span className="text-[10px] font-semibold text-[#FBBF24]">+more</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Decorative flow — dot speed tracks arrivals ({arr}/hr) and the slowest stage; the orb is the AI gate;
                ~35% of cases wait for a doctor. The red dot is an urgent case at the front of the review queue.
              </p>

              {/* bottleneck banner */}
              <div className={cn("mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3 py-2.5 text-sm", bannerCls.box)}>
                <BannerIcon className="h-4 w-4 shrink-0" />
                <span className={cn("chip shrink-0 text-[10px]", bannerCls.chip)}>{out.bottleneck}</span>
                <span className="text-muted-foreground">{banner.msg}</span>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </div>

      {/* ── 4 · District scaling chart ───────────────────── */}
      <Reveal className="mt-6">
        <GlassCard>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">District scaling</h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Scaling the district pilot: the same deployment replicated across a state.
              </p>
            </div>
            <span className="chip border-[#22D3EE]/40 text-[#22D3EE]">
              {to100k.districts} district{to100k.districts === 1 ? "" : "s"} → ~
              {to100k.patientsPerYear.toLocaleString("en-IN")} patients / year
            </span>
          </div>
          <div className="mt-4 h-60 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scaling} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="capScalingFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(34,211,238,0.08)" vertical={false} />
                <XAxis
                  dataKey="districts"
                  stroke={AXIS}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(130,150,179,0.35)" }}
                />
                <YAxis
                  stroke={AXIS}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <RTooltip content={<ScalingTip />} cursor={{ stroke: "rgba(34,211,238,0.25)", strokeDasharray: "3 3" }} />
                <ReferenceLine
                  y={100000}
                  stroke={AMBER}
                  strokeDasharray="6 4"
                  label={{ value: "100k / year", fill: AMBER, fontSize: 11, position: "insideTopRight" }}
                />
                <Area
                  type="monotone"
                  dataKey="patientsPerYear"
                  name="Patients / year"
                  stroke={CYAN}
                  strokeWidth={2}
                  fill="url(#capScalingFill)"
                  activeDot={{ r: 4, fill: CYAN, stroke: "#060B14" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </Reveal>

      {/* ── 5 · Sanity strip ─────────────────────────────── */}
      <Reveal className="mt-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sanity</span>
          {overloaded && (
            <span className="chip border-[#F87171]/45 bg-[#F87171]/10 text-[#F87171] shadow-[0_0_16px_rgba(248,113,113,0.2)]">
              <TriangleAlert className="h-3 w-3" />
              System overloaded — wait times unbounded
            </span>
          )}
          <span className={cn("chip", capTone.chip)}>capture utilization {out.utilizationPct}%</span>
          <span className={cn("chip", revTone.chip)}>review utilization {out.reviewUtilizationPct}%</span>
          <span className={cn("chip", revWait.chip)}>
            review wait {out.reviewWaitMin >= UNBOUNDED_WAIT ? "unbounded (∞)" : `${out.reviewWaitMin} min`}
          </span>
        </div>
      </Reveal>
    </section>
  );
}
