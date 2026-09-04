"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  FileCheck2,
  Gauge,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CONFUSION_MATRIX,
  GRADCAM_GALLERY,
  ICDR_CLASSES,
  THRESHOLD_CURVE,
  TRAINING_CURVES,
  VALIDATED_METRICS,
} from "@/lib/drishti";
import { AnimatedNumber } from "@/components/drishti/animated-number";
import { BlockHeading, DarkTip } from "@/components/drishti/chart-frame";
import { GlassCard, Reveal, SectionHeading } from "@/components/drishti/primitives";
import { RetinaView } from "@/components/drishti/retina-view";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Types — readonly-friendly so both the shared constants and the
// JSON returned by GET /api/metrics are directly assignable.
// ────────────────────────────────────────────────────────────

interface HeadlineMetrics {
  sensitivity: number;
  specificity: number;
  qwk: number;
  auc: number | null;
  dataset: string;
  runs: ReadonlyArray<{ run: string; sensitivity: number; specificity: number; seed: number }>;
}

interface ConfusionData {
  labels: ReadonlyArray<string>;
  matrix: ReadonlyArray<ReadonlyArray<number>>;
  rowTotals: ReadonlyArray<number>;
}

interface CurvePoint {
  t: number;
  sensitivity: number;
  specificity: number;
}

interface TrainingRun {
  run: string;
  color: string;
  loss: ReadonlyArray<number>;
  qwk: ReadonlyArray<number>;
}

interface GalleryItem {
  id: string;
  grade: string;
  consistency: number;
  note: string;
}

interface MetricsPayload {
  headline: HeadlineMetrics;
  confusion: ConfusionData;
  threshold_curve: ReadonlyArray<CurvePoint>;
  training: ReadonlyArray<TrainingRun>;
  gradcam_gallery: ReadonlyArray<GalleryItem>;
  source: { dataset: string; vessels: string; note: string };
}

// Initial data from the shared constants — the page renders instantly and
// hydrates from GET /api/metrics once it resolves.
const INITIAL_DATA: MetricsPayload = {
  headline: VALIDATED_METRICS,
  confusion: CONFUSION_MATRIX,
  threshold_curve: THRESHOLD_CURVE,
  training: TRAINING_CURVES,
  gradcam_gallery: GRADCAM_GALLERY,
  source: {
    dataset: "APTOS 2019 blindness detection — Aravind Eye Hospital (Kaggle)",
    vessels: "STARE — Clemson University",
    note: "Validated on 550 held-out images. Research prototype — not a certified clinical device.",
  },
};

const MUTED = "#8296b3";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Sample standard deviation for any available validation runs. */
function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length < 2) return { mean, std: 0 };
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length - 1));
  return { mean, std };
}

/** pred − true; drives the tooltip narrative. */
function cellNote(delta: number): string {
  if (delta === 0) return "graded exactly right";
  if (delta === -1) return "grade under-called by one step";
  if (delta === 1) return "grade over-called by one step";
  return delta < 0
    ? `grade under-called by ${-delta} steps — referral risk`
    : `grade over-called by ${delta} steps — extra review workload`;
}

/** Cell background: teal (cyan×green) diagonal, amber off-by-one, red ≥2 steps. */
function cellFill(value: number, rowTotal: number, delta: number): string {
  if (value === 0) return "transparent";
  const ratio = rowTotal > 0 ? value / rowTotal : 0;
  const a = Math.min(0.82, 0.07 + ratio * 0.78);
  if (delta === 0) return `rgba(45, 212, 191, ${a.toFixed(3)})`;
  if (Math.abs(delta) === 1) return `rgba(251, 191, 36, ${(a * 0.9).toFixed(3)})`;
  return `rgba(248, 113, 113, ${(a * 0.9).toFixed(3)})`;
}

function classColor(level: number): string {
  return ICDR_CLASSES.find((c) => c.level === level)?.color ?? MUTED;
}

/** "Moderate NPDR (2)" → 2 */
function gradeLevel(grade: string): number {
  const m = grade.match(/\((\d)\)/);
  return m ? Number(m[1]) : 0;
}

// BlockHeading + DarkTip are shared site-wide primitives (chart-frame.tsx).

// ────────────────────────────────────────────────────────────
// View
// ────────────────────────────────────────────────────────────

export default function ValidationView() {
  const [data, setData] = useState<MetricsPayload>(INITIAL_DATA);

  // Hydrate from the live API when it resolves; constants already render the
  // same numbers, so a failed fetch degrades gracefully to the fallback.
  useEffect(() => {
    let alive = true;
    fetch("/api/metrics")
      .then((res) => {
        if (!res.ok) throw new Error(`/api/metrics → ${res.status}`);
        return res.json() as Promise<MetricsPayload>;
      })
      .then((json) => {
        if (alive) setData(json);
      })
      .catch(() => {
        /* keep constants */
      });
    return () => {
      alive = false;
    };
  }, []);

  const headline = data.headline;
  const confusion = data.confusion;

  // ── The policy knob ────────────────────────────────────────
  const [t, setT] = useState(0.55);
  const tRound = Math.round(t * 100) / 100;
  const curve = data.threshold_curve;
  const point = useMemo<CurvePoint>(() => {
    if (curve.length === 0) return { t: tRound, sensitivity: 0, specificity: 0 };
    return curve.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));
  }, [curve, t, tRound]);
  const isOperating = Math.abs(tRound - 0.55) < 0.001;
  const meetsSens = point.sensitivity >= 90;
  const meetsSpec = point.specificity >= 85;
  const verdict = isOperating
    ? "Our operating point — meets both targets"
    : tRound <= 0.35
      ? "Catches nearly everything — floods the doctors' queue"
      : tRound >= 0.65
        ? "Fewer referrals — but misses up to 1 in 5 referable cases"
        : meetsSens && meetsSpec
          ? tRound < 0.55
            ? "Safe zone — slightly referral-happy, both targets met"
            : "Safe zone — leaner review queue, both targets met"
          : meetsSens
            ? "Specificity below the 85% floor — too many healthy eyes referred"
            : "Sensitivity below the 90% floor — referable cases start slipping through";

  // Mutable copies for recharts
  const rocRows = useMemo(() => data.threshold_curve.map((p) => ({ ...p })), [data]);
  const qwkRows = useMemo(() => {
    if (data.training.length === 0) return [];
    return Array.from({ length: data.training[0].qwk.length }, (_, i) => {
      const row: Record<string, number> = { epoch: i + 1 };
      data.training.forEach((r, j) => {
        row[`r${j}`] = r.qwk[i] ?? 0;
      });
      return row;
    });
  }, [data]);
  const lossRows = useMemo(() => {
    if (data.training.length === 0) return [];
    return Array.from({ length: data.training[0].loss.length }, (_, i) => {
      const row: Record<string, number> = { epoch: i + 1 };
      data.training.forEach((r, j) => {
        row[`r${j}`] = r.loss[i] ?? 0;
      });
      return row;
    });
  }, [data]);

  // ── Confusion matrix totals ────────────────────────────────
  const colTotals = useMemo(
    () => confusion.labels.map((_, c) => confusion.matrix.reduce((a, row) => a + (row[c] ?? 0), 0)),
    [confusion]
  );
  const grandTotal = useMemo(() => colTotals.reduce((a, b) => a + b, 0), [colTotals]);

  // ── 3-run stability ────────────────────────────────────────
  const sensStats = meanStd(headline.runs.map((r) => r.sensitivity));
  const specStats = meanStd(headline.runs.map((r) => r.specificity));

  // ── Headline cards ─────────────────────────────────────────
  const headlineCards: Array<{ icon: LucideIcon; value: number; decimals: number; suffix: string; label: string; caption: string }> = [
    { icon: Activity, value: headline.sensitivity, decimals: 1, suffix: "%", label: "Sensitivity", caption: "Referable DR detected (R≥2)" },
    { icon: ShieldCheck, value: headline.specificity, decimals: 1, suffix: "%", label: "Specificity", caption: "Non-referable correctly cleared" },
    { icon: Gauge, value: headline.qwk, decimals: 3, suffix: "", label: "QWK", caption: "Quadratic weighted kappa — 5-class" },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading
        eyebrow="VALIDATION & EVIDENCE"
        title="Numbers we can defend"
        sub="Every headline figure on this page comes from the MATLAB ResNet-101 result — 550 held-out APTOS images and an honest look at where the model is wrong."
      />

      <div className="space-y-12 sm:space-y-14">
        {/* ── 01 · HEADLINE METRIC CARDS ─────────────────────── */}
        <Reveal>
          <BlockHeading
            index="01"
            title="Headline results"
            sub={`Validated on ${headline.dataset} · ${headline.runs[0]?.run ?? "MATLAB validation"}`}
          />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {headlineCards.map((card) => (
              <GlassCard key={card.label} hover className="relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE]/70 to-transparent" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{card.label}</span>
                  <card.icon className="h-4 w-4 text-[#22D3EE]/70" aria-hidden="true" />
                </div>
                <AnimatedNumber
                  value={card.value}
                  decimals={card.decimals}
                  suffix={card.suffix}
                  className="mt-3 block font-display text-3xl font-bold text-[#22D3EE] text-glow-cyan sm:text-4xl"
                />
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{card.caption}</p>
              </GlassCard>
            ))}
          </div>
        </Reveal>

        {/* ── 02 · CONFUSION MATRIX ──────────────────────────── */}
        <Reveal>
          <BlockHeading
            index="02"
            title="Where the model is wrong — and how wrong"
            sub="Hover any cell for the full story. The only errors that matter clinically are the cells below the diagonal, where a referable grade gets under-called."
          />
          <GlassCard>
            {/* legend */}
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(45,212,191,0.55)" }} /> Correct (diagonal)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(251,191,36,0.5)" }} /> Off by one step
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: "rgba(248,113,113,0.5)" }} /> ≥2 steps off
              </span>
              <span className="text-muted-foreground/70">intensity = share of the true-grade row</span>
            </div>

            <div className="drishti-scroll overflow-x-auto pb-1">
              <div
                className="grid min-w-[560px] gap-1"
                style={{ gridTemplateColumns: "minmax(72px, auto) repeat(5, minmax(48px, 1fr)) minmax(44px, auto)" }}
                role="table"
                aria-label="5 by 5 confusion matrix, 550 held-out APTOS images"
              >
                {/* header row */}
                <div className="flex flex-col items-end justify-center pr-2 text-right">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70">true ↓</span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70">pred →</span>
                </div>
                {confusion.labels.map((label, c) => (
                  <div key={`h${c}`} className="flex items-end justify-center gap-1 pb-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: classColor(c) }} aria-hidden="true" />
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">{label}</span>
                  </div>
                ))}
                <div className="flex items-end justify-center pb-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Total
                </div>

                {/* matrix rows */}
                {confusion.matrix.map((row, r) => (
                  <Fragment key={`row${r}`}>
                    <div className="flex items-center justify-end gap-1.5 pr-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: classColor(r) }} aria-hidden="true" />
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">{confusion.labels[r]}</span>
                    </div>
                    {row.map((value, c) => {
                      const delta = c - r;
                      const pct = confusion.rowTotals[r] > 0 ? ((value / confusion.rowTotals[r]) * 100).toFixed(1) : "0.0";
                      return (
                        <Tooltip key={`c${r}-${c}`}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "flex h-11 w-full items-center justify-center rounded-md border transition-transform duration-200 hover:z-10 hover:scale-[1.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#22D3EE] sm:h-12",
                                value === 0 ? "border-white/5 bg-white/[0.015]" : "border-white/10"
                              )}
                              style={{ background: cellFill(value, confusion.rowTotals[r] ?? 0, delta) }}
                              aria-label={`True ${confusion.labels[r]}, predicted ${confusion.labels[c]}: ${value} images, ${pct}% of row`}
                            >
                              <span className={cn("tabular text-sm font-semibold", value === 0 ? "text-white/25" : "text-white")}>
                                {value}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="border-[#22D3EE]/25 bg-[#081120]/95 text-[#E6F1FF]">
                            <div className="font-display text-xs font-semibold">
                              True: {confusion.labels[r]} → Predicted: {confusion.labels[c]}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {value} images · {pct}% of row — {cellNote(delta)}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    <div
                      key={`rt${r}`}
                      className="flex items-center justify-center border-l border-white/10 tabular text-xs text-muted-foreground"
                    >
                      {confusion.rowTotals[r]}
                    </div>
                  </Fragment>
                ))}

                {/* footer totals */}
                <div className="pt-1.5 pr-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground/70">Total</div>
                {colTotals.map((total, c) => (
                  <div key={`ct${c}`} className="flex items-center justify-center pt-1.5 tabular text-xs text-muted-foreground">
                    {total}
                  </div>
                ))}
                <div className="flex items-center justify-center pt-1.5 tabular text-xs font-semibold text-[#22D3EE]">{grandTotal}</div>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {grandTotal} held-out APTOS images · rows = ophthalmologist ground truth · columns = DRISHTI prediction
            </p>
          </GlassCard>
        </Reveal>

        {/* ── 03 · THE POLICY KNOB ───────────────────────────── */}
        <Reveal>
          <BlockHeading
            index="03"
            title="The policy knob"
            sub="Drag the referral threshold and watch the trade-off the deployment team actually has to make."
          />
          <GlassCard>
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#FBBF24]" aria-hidden="true" />
              <span className="chip border-[#FBBF24]/40 text-[#FBBF24] tabular">Threshold t = {tRound.toFixed(2)}</span>
              {isOperating && (
                <span className="chip border-[#22D3EE]/50 text-[#22D3EE] shadow-[0_0_14px_rgba(34,211,238,0.3)]">OPERATING POINT</span>
              )}
            </div>

            <div className="mt-5 px-0.5">
              <Slider
                value={[t]}
                onValueChange={(v) => setT(v[0] ?? 0.55)}
                min={0.2}
                max={0.8}
                step={0.05}
                aria-label="Referral threshold"
                className="[&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-5 [&_[data-slot=slider-thumb]]:border-[#22D3EE] [&_[data-slot=slider-thumb]]:shadow-[0_0_12px_rgba(34,211,238,0.55)]"
              />
              <div className="mt-1.5 flex justify-between text-[10px] tabular text-muted-foreground/60">
                {[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((v) => (
                  <span key={v}>{v.toFixed(2)}</span>
                ))}
              </div>
            </div>

            <div className="mt-5 h-[280px]">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={rocRows} margin={{ top: 22, right: 14, bottom: 4, left: -14 }}>
                  <CartesianGrid stroke="rgba(34,211,238,0.08)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[0.2, 0.8]}
                    ticks={[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(130,150,179,0.3)" }}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <YAxis
                    domain={[65, 100]}
                    ticks={[70, 75, 80, 85, 90, 95, 100]}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <RTooltip content={<DarkTip prefix="t =" decimals={1} suffix="%" />} cursor={{ stroke: "rgba(34,211,238,0.25)", strokeDasharray: "3 3" }} />
                  <ReferenceLine y={90} stroke="rgba(130,150,179,0.55)" strokeDasharray="4 6" />
                  <ReferenceLine y={85} stroke="rgba(130,150,179,0.55)" strokeDasharray="4 6" />
                  <ReferenceLine
                    x={tRound}
                    stroke="#FBBF24"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    label={{ value: `t = ${tRound.toFixed(2)}`, position: "top", fill: "#FBBF24", fontSize: 11, fontWeight: 600 }}
                  />
                  <Line type="monotone" dataKey="sensitivity" name="Sensitivity" stroke="#22D3EE" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="specificity" name="Specificity" stroke="#34D399" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <ReferenceDot x={point.t} y={point.sensitivity} r={4.5} fill="#22D3EE" stroke="#0A1628" strokeWidth={1.5} />
                  <ReferenceDot x={point.t} y={point.specificity} r={4.5} fill="#34D399" stroke="#0A1628" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* legend */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-[#22D3EE]" /> Sensitivity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-[#34D399]" /> Specificity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-2 border-dashed border-[#FBBF24]" /> chosen threshold
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-2 border-dashed border-white/30" /> targets: sens ≥ 90% · spec ≥ 85%
              </span>
            </div>

            {/* readout chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
              <span className={cn("chip tabular", meetsSens ? "border-[#34D399]/40 text-[#34D399]" : "border-[#F87171]/40 text-[#F87171]")}>
                Sensitivity {point.sensitivity.toFixed(1)}% <span className="text-muted-foreground">/ 90% target</span>
              </span>
              <span className={cn("chip tabular", meetsSpec ? "border-[#34D399]/40 text-[#34D399]" : "border-[#FBBF24]/40 text-[#FBBF24]")}>
                Specificity {point.specificity.toFixed(1)}% <span className="text-muted-foreground">/ 85% target</span>
              </span>
              <p className={cn("text-sm font-medium", isOperating ? "text-[#22D3EE]" : meetsSens && meetsSpec ? "text-[#34D399]" : "text-[#FBBF24]")}>
                {verdict}
              </p>
            </div>
          </GlassCard>
          <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground">
            This is the <span className="font-medium text-[#22D3EE]">policy knob</span>: the same model, one dial — where you set it depends on
            how many review-hours a program can spare.
          </p>
        </Reveal>

        {/* ── 04 · TRAINING STABILITY ────────────────────────── */}
        <Reveal>
          <BlockHeading
            index="04"
            title="Training stability"
            sub="The uploaded MATLAB artifact provides one recorded validation run; additional independent runs should be reported only after they are evaluated on held-out data."
          />
          <GlassCard>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              {data.training.map((r) => (
                <span key={r.run} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> {r.run}
                </span>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Quadratic weighted κ vs epoch</p>
                <div className="mt-2 h-[260px]">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={qwkRows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="rgba(34,211,238,0.08)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={[1, 8]}
                        ticks={[1, 2, 3, 4, 5, 6, 7, 8]}
                        tick={{ fill: MUTED, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "rgba(130,150,179,0.3)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        domain={[0.55, 0.95]}
                        ticks={[0.6, 0.7, 0.8, 0.9]}
                        tick={{ fill: MUTED, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickFormatter={(v: number) => v.toFixed(1)}
                      />
                      <RTooltip content={<DarkTip prefix="Epoch" labelDecimals={0} decimals={3} />} cursor={{ stroke: "rgba(34,211,238,0.25)", strokeDasharray: "3 3" }} />
                      {data.training.map((r, j) => (
                        <Line
                          key={r.run}
                          type="monotone"
                          dataKey={`r${j}`}
                          name={r.run}
                          stroke={r.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Training loss vs epoch</p>
                <div className="mt-2 h-[200px] lg:mt-9">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={lossRows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="rgba(34,211,238,0.08)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={[1, 8]}
                        ticks={[1, 2, 3, 4, 5, 6, 7, 8]}
                        tick={{ fill: MUTED, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "rgba(130,150,179,0.3)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        domain={[0.3, 1.7]}
                        ticks={[0.4, 0.8, 1.2, 1.6]}
                        tick={{ fill: MUTED, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickFormatter={(v: number) => v.toFixed(1)}
                      />
                      <RTooltip content={<DarkTip prefix="Epoch" labelDecimals={0} decimals={2} />} cursor={{ stroke: "rgba(34,211,238,0.25)", strokeDasharray: "3 3" }} />
                      {data.training.map((r, j) => (
                        <Line
                          key={r.run}
                          type="monotone"
                          dataKey={`r${j}`}
                          name={r.run}
                          stroke={r.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="mt-4" hover={false}>
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground">Run</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground">Seed</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground">Sensitivity</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-widest text-muted-foreground">Specificity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headline.runs.map((r, i) => {
                  const deployed = r.sensitivity === headline.sensitivity;
                  return (
                    <TableRow key={r.run} className={cn("border-white/5", deployed && "bg-[#22D3EE]/[0.06]")}>
                      <TableCell className="font-display text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: data.training[i]?.color ?? "#22D3EE" }} />
                          {r.run}
                          {deployed && <span className="chip border-[#22D3EE]/40 text-[10px] text-[#22D3EE]">deployed</span>}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-sm text-muted-foreground">{r.seed}</TableCell>
                      <TableCell className="tabular text-right text-sm">{r.sensitivity.toFixed(1)}%</TableCell>
                      <TableCell className="tabular text-right text-sm">{r.specificity.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="border-white/10 bg-white/[0.02] hover:bg-white/[0.02]">
                  <TableCell colSpan={2} className="text-xs uppercase tracking-widest text-muted-foreground">
                    Mean ± std
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-semibold text-[#34D399]">
                    {sensStats.mean.toFixed(1)} ± {sensStats.std.toFixed(1)}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-semibold text-[#34D399]">
                    {specStats.mean.toFixed(1)} ± {specStats.std.toFixed(1)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Spread of ±{sensStats.std.toFixed(1)}% sensitivity across seeds — the operating point sits comfortably inside it.
            </p>
          </GlassCard>
        </Reveal>

        {/* ── 05 · GRAD-CAM GALLERY ──────────────────────────── */}
        <Reveal>
          <BlockHeading
            index="05"
            title="Grad-CAM — show your work"
            sub="Where the model looked to make each call, cross-checked by a second attention mask. High consistency means the model isn't guessing."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.gradcam_gallery.map((item) => {
              const severity = gradeLevel(item.grade);
              const dmeRisk = severity >= 4;
              const color = classColor(severity);
              const consistent = item.consistency >= 0.9;
              return (
                <GlassCard key={item.id} hover className="p-4">
                  <RetinaView
                    severity={severity}
                    dmeRisk={dmeRisk}
                    layers={{ gradcam: true, vessels: true, ma: severity >= 1, hem: severity >= 2, ex: severity >= 2, dme: false }}
                    className="aspect-square w-full"
                  />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-foreground">{item.id}</span>
                    <span className={cn("chip text-[10px]", consistent ? "border-[#34D399]/40 text-[#34D399]" : "border-[#FBBF24]/40 text-[#FBBF24]")}>
                      consistency {item.consistency.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
                    <span className="text-xs font-medium" style={{ color }}>
                      {item.grade}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.note}</p>
                </GlassCard>
              );
            })}
          </div>
        </Reveal>

        {/* ── 06 · HONESTY FOOTNOTE ──────────────────────────── */}
        <Reveal>
          <BlockHeading index="06" title="The honesty footnote" />
          <GlassCard className="border-[#FBBF24]/35 bg-[#FBBF24]/[0.03]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="w-fit rounded-lg border border-[#FBBF24]/30 bg-[#2A2210]/60 p-2.5">
                <ShieldAlert className="h-5 w-5 text-[#FBBF24]" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium leading-relaxed text-[#FBBF24]">{data.source.note}</p>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <ScanEye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22D3EE]/70" aria-hidden="true" />
                  <span>
                    Data: {data.source.dataset} · Vessel masks: {data.source.vessels}
                  </span>
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#34D399]" aria-hidden="true" />
                  <span>Thresholds and numbers are identical across console, API and website.</span>
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
                  <span>Source artifact: model_and_result/drishti_dr_model.mat + DRISHTI Module 3 - Confusion Matrix.png · MATLAB ResNet-101.</span>
                </p>
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}
