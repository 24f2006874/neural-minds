"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Eye,
  Microscope,
  Play,
  Route,
  ScanEye,
  ScanSearch,
  ShieldCheck,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react";
import { AnimatedNumber } from "@/components/drishti/animated-number";
import { GlassCard, Reveal, SectionHeading } from "@/components/drishti/primitives";
import { RetinaView } from "@/components/drishti/retina-view";
import { useNav } from "@/components/drishti/shell";
import { VALIDATED_METRICS } from "@/lib/drishti";

const HeroEye = dynamic(() => import("@/components/views/hero-eye"), { ssr: false, loading: () => null });

// ─────────────────────────────────────────────────────────────────────
// 1) HERO — full-viewport 3D eye + overlay
// ─────────────────────────────────────────────────────────────────────

function Hero() {
  const { navigate } = useNav();

  const scrollToProblem = () => {
    const el = document.getElementById("home-problem");
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const enter = (delay: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: "easeOut" as const },
  });

  return (
    <section className="relative flex min-h-[92svh] flex-col overflow-hidden">
      {/* 3D eye (WebGL) — graceful static fallback baked into the component */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <HeroEye />
      </div>

      {/* readability gradients + grid texture */}
      <div className="drishti-grid-overlay pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#060B14]/95 via-transparent to-transparent md:hidden" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-[1] hidden bg-gradient-to-r from-[#060B14]/90 via-[#060B14]/35 to-transparent md:block" aria-hidden="true" />

      {/* overlay content */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-4 pb-6 pt-28 sm:justify-center sm:px-6 sm:pb-10 sm:pt-16">
        <div className="max-w-2xl">
          <motion.span {...enter(0)} className="chip border-[#22D3EE]/30 text-[#22D3EE]">
            TEAM NEURAL MINDS · SIH 2026 · PS 26038
          </motion.span>
          <motion.h1
            {...enter(0.06)}
            className="text-glow-cyan mt-5 font-display text-6xl font-bold tracking-widest text-[#E6F1FF] sm:text-7xl lg:text-8xl"
          >
            DRISHTI
          </motion.h1>
          <motion.p {...enter(0.12)} className="mt-4 font-display text-xl font-medium text-[#A5F3FC] sm:text-2xl">
            AI that knows when to trust itself.
          </motion.p>
          <motion.p {...enter(0.18)} className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Trust-gated diabetic retinopathy screening for the last mile — the AI shows its evidence, grades the
            disease, and routes every case by how much it trusts itself.
          </motion.p>
          <motion.div {...enter(0.24)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={() => navigate("screening")}
              className="btn-glow-cyan inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#22D3EE] px-7 py-3 font-display text-base font-semibold text-[#04121c] transition-all"
            >
              <ScanEye className="h-5 w-5" /> Launch Screening
            </button>
            <button
              onClick={() => navigate("how")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#22D3EE]/40 bg-white/[0.03] px-7 py-3 font-display text-base font-semibold text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
            >
              <Play className="h-5 w-5" /> Watch it work
            </button>
          </motion.div>
        </div>
      </div>

      {/* scroll hint + validation strip preview */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-5 sm:px-6">
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={scrollToProblem}
            aria-label="Scroll to the problem"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:text-[#22D3EE]"
          >
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </button>
          <div className="glass-card flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 rounded-full px-5 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#34D399]" />
              <span className="tabular font-semibold text-[#34D399]">{VALIDATED_METRICS.sensitivity}%</span>
              sensitivity
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#34D399]" />
              <span className="tabular font-semibold text-[#34D399]">{VALIDATED_METRICS.specificity}%</span>
              specificity
            </span>
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-[#22D3EE]" />
              <span className="tabular font-semibold text-[#22D3EE]">QWK {VALIDATED_METRICS.qwk}</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="tabular font-semibold text-foreground">550</span> held-out APTOS images
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2) PROBLEM STRIP — animated counters
// ─────────────────────────────────────────────────────────────────────

const PROBLEM_STATS: Array<{
  icon: typeof Users;
  value: number;
  suffix: string;
  label: string;
  sub: string;
  line: string;
  wrap: string;
  text: string;
}> = [
  {
    icon: Users,
    value: 77,
    suffix: "M",
    label: "Diabetics in India",
    sub: "IDF Atlas — world's diabetes capital",
    line: "bg-gradient-to-r from-transparent via-[#F87171]/50 to-transparent",
    wrap: "border-[#F87171]/40 bg-[#2E0F12]/60",
    text: "text-[#F87171]",
  },
  {
    icon: Stethoscope,
    value: 100000,
    suffix: "",
    label: "Rural patients per ophthalmologist",
    sub: "1 : 100,000 — the last-mile gap",
    line: "bg-gradient-to-r from-transparent via-[#FBBF24]/50 to-transparent",
    wrap: "border-[#FBBF24]/40 bg-[#2A2210]/60",
    text: "text-[#FBBF24]",
  },
  {
    icon: Eye,
    value: 90,
    suffix: "%",
    label: "Of vision loss preventable if caught early",
    sub: "Early grading changes the outcome",
    line: "bg-gradient-to-r from-transparent via-[#34D399]/50 to-transparent",
    wrap: "border-[#34D399]/40 bg-[#0A2E24]/60",
    text: "text-[#34D399]",
  },
];

function ProblemStrip() {
  return (
    <section id="home-problem" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="THE PROBLEM"
        title="Screening capacity is the bottleneck."
        sub="India runs the world's largest diabetes epidemic with a fraction of the specialists needed to screen it — diabetic retinopathy catches up before care does."
      />
      <div className="grid gap-5 md:grid-cols-3 md:gap-6">
        {PROBLEM_STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.1}>
            <GlassCard hover className="relative overflow-hidden text-center">
              <span className={`absolute inset-x-8 top-0 h-px ${s.line}`} aria-hidden="true" />
              <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-lg border ${s.wrap}`}>
                <s.icon className={`h-5 w-5 ${s.text}`} />
              </div>
              <div className="mt-4">
                <AnimatedNumber
                  value={s.value}
                  suffix={s.suffix}
                  className="font-display text-4xl font-bold text-[#22D3EE] sm:text-5xl"
                />
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{s.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3) LIVE PIPELINE PREVIEW — 5 glowing orbs + flowing light
// ─────────────────────────────────────────────────────────────────────

const MODULES: Array<{ n: string; name: string; icon: typeof ShieldCheck; oneLiner: ReactNode }> = [
  { n: "01", name: "Trust Gate", icon: ShieldCheck, oneLiner: "Blurry image? Rejected before AI runs" },
  { n: "02", name: "Evidence Engine", icon: Microscope, oneLiner: "Microaneurysms, hemorrhages, exudates counted" },
  { n: "03", name: "CNN Grading", icon: BrainCircuit, oneLiner: "ICDR 0–4 grade + confidence" },
  { n: "04", name: "Grad-CAM Explain", icon: ScanSearch, oneLiner: "The model shows WHERE it looked" },
  {
    n: "05",
    name: "Trust Routing",
    icon: Route,
    oneLiner: (
      <>
        <span className="font-semibold text-[#34D399]">GREEN</span> auto ·{" "}
        <span className="font-semibold text-[#FBBF24]">AMBER</span> doctor ·{" "}
        <span className="font-semibold text-[#F87171]">RED</span> urgent
      </>
    ),
  },
];

function PipelinePreview() {
  const { navigate } = useNav();
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="THE PIPELINE"
        title="Five modules. One trustworthy verdict."
        sub="Every case runs the same auditable chain — quality gate, lesion evidence, CNN grading, Grad-CAM explainability, trust routing — and every step leaves evidence a doctor can check."
      />

      <div className="relative">
        {/* desktop connector: flowing light across the orb centers */}
        <svg
          className="pointer-events-none absolute inset-x-0 top-7 hidden h-[2px] w-full md:block"
          aria-hidden="true"
        >
          <line x1="10%" y1="1" x2="90%" y2="1" stroke="rgba(34,211,238,0.18)" strokeWidth="2" />
          <line className="flow-dash" x1="10%" y1="1" x2="90%" y2="1" stroke="#22D3EE" strokeWidth="2" opacity="0.55" />
        </svg>
        {/* mobile connector: vertical trace behind the stack */}
        <div
          className="pointer-events-none absolute bottom-12 left-1/2 top-7 w-px -translate-x-1/2 bg-gradient-to-b from-[#22D3EE]/40 via-[#22D3EE]/15 to-[#22D3EE]/40 md:hidden"
          aria-hidden="true"
        />

        <div className="grid gap-10 md:grid-cols-5 md:gap-4">
          {MODULES.map((m, i) => (
            <Reveal key={m.n} delay={i * 0.08}>
              <div className="relative flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-[#22D3EE]/45 bg-[#081120] shadow-[0_0_22px_rgba(34,211,238,0.3)]">
                  <m.icon className="h-6 w-6 text-[#22D3EE]" />
                </div>
                <span className="tabular mt-3 font-display text-[11px] font-bold tracking-[0.25em] text-[#67E8F9]">
                  {m.n}
                </span>
                <h3 className="mt-1 font-display text-sm font-semibold text-foreground sm:text-base">{m.name}</h3>
                <p className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-muted-foreground">{m.oneLiner}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal delay={0.2} className="mt-12 flex justify-center">
        <button
          onClick={() => navigate("how")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#22D3EE]/40 bg-white/[0.03] px-6 py-2.5 text-sm font-semibold text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
        >
          See the full walkthrough <ArrowRight className="h-4 w-4" />
        </button>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4) TRUST GATE TEASER — accept vs reject split
// ─────────────────────────────────────────────────────────────────────

function TrustGateTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="MODULE 01 — TRUST GATE"
        title="Bad images never reach the AI."
        sub="A quality gate runs before any inference. Sharp captures continue; blurry ones are stamped and sent back for recapture — so the model never gets to be confidently wrong."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* ACCEPT — clean capture */}
        <Reveal>
          <div className="relative h-full rounded-xl border border-[#34D399]/40 bg-[#0A2E24]/25 p-3 shadow-[0_0_32px_rgba(52,211,153,0.14)] sm:p-4">
            <RetinaView severity={1} className="aspect-square w-full" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip border-[#34D399]/50 bg-[#0A2E24]/80 text-[#34D399] shadow-[0_0_16px_rgba(52,211,153,0.25)]">
                <CheckCircle2 className="h-3.5 w-3.5" /> ACCEPT — QUALITY 0.88
              </span>
              <span className="text-xs text-muted-foreground">quality ≥ 0.55 passes</span>
            </div>
            <p className="mt-2 text-sm text-foreground/90">Clean capture → pipeline continues</p>
          </div>
        </Reveal>

        {/* REJECT — blurry capture */}
        <Reveal delay={0.1}>
          <div className="relative h-full rounded-xl border border-[#F87171]/45 bg-[#2E0F12]/25 p-3 shadow-[0_0_32px_rgba(248,113,113,0.12)] sm:p-4">
            <RetinaView severity={0} blur={0.85} rejected className="aspect-square w-full" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip border-[#F87171]/50 bg-[#2E0F12]/80 text-[#F87171] shadow-[0_0_16px_rgba(248,113,113,0.25)]">
                <XCircle className="h-3.5 w-3.5" /> REJECTED — QUALITY 0.34 · RECAPTURE
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground/90">Blurry capture → AI never runs</p>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.15}>
        <p className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#34D399]" />
          The gate protects patients from confidently-wrong AI on bad images.
        </p>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5) VALIDATION BANNER — full-width, real numbers from lib
// ─────────────────────────────────────────────────────────────────────

const BANNER_STATS = [
  {
    value: VALIDATED_METRICS.sensitivity,
    decimals: 1,
    suffix: "%",
    label: "Sensitivity",
    sub: "Referable DR caught",
  },
  {
    value: VALIDATED_METRICS.specificity,
    decimals: 1,
    suffix: "%",
    label: "Specificity",
    sub: "Healthy eyes cleared",
  },
  {
    value: VALIDATED_METRICS.qwk,
    decimals: 3,
    suffix: "",
    label: "QWK (κ)",
    sub: "Agreement with expert graders",
  },
  {
    value: VALIDATED_METRICS.runs.length,
    decimals: 0,
    suffix: "",
    label: "Stable training runs",
    sub: `Seeds ${VALIDATED_METRICS.runs.map((r) => r.seed).join(" · ")}`,
  },
];

function ValidationBanner() {
  const { navigate } = useNav();
  return (
    <section className="glass-strong border-x-0 py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="flex justify-center">
          <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">VALIDATED ON REAL DATA</span>
        </Reveal>

        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {BANNER_STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.07} className="text-center">
              <AnimatedNumber
                value={s.value}
                decimals={s.decimals}
                suffix={s.suffix}
                className="font-display text-3xl font-bold text-[#22D3EE] sm:text-4xl"
              />
              <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">{s.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.sub}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.25}>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            Validated on 550 held-out APTOS images — Aravind Eye Hospital (Kaggle). Research prototype, not a
            certified clinical device.
          </p>
          <div className="mt-5 flex justify-center">
            <button
              onClick={() => navigate("validation")}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#22D3EE]/40 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
            >
              <BadgeCheck className="h-4 w-4" /> See the evidence
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6) FINAL CTA
// ─────────────────────────────────────────────────────────────────────

function FinalCta() {
  const { navigate } = useNav();
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Watch the whole pipeline run live.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Upload a fundus image and watch every module fire — quality gate, lesion evidence, CNN grading, Grad-CAM
          explainability, trust routing — ending in a color-coded clinical verdict with a downloadable report.
        </p>
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => navigate("screening")}
            className="btn-glow-cyan pulse-ring inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-[#22D3EE] px-9 py-4 font-display text-lg font-bold text-[#04121c] transition-all"
          >
            <ScanEye className="h-5 w-5" /> Launch Screening
          </button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No signup · demo patient IDs · full run in ~6 seconds</p>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────

export default function HomeView() {
  return (
    <>
      <Hero />
      <ProblemStrip />
      <PipelinePreview />
      <TrustGateTeaser />
      <ValidationBanner />
      <FinalCta />
    </>
  );
}
