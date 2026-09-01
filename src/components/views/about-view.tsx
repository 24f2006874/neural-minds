"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Database,
  FlaskConical,
  Github,
  GraduationCap,
  Info,
  NotebookPen,
  Scale,
  ScanEye,
  Target,
  Terminal,
  Workflow,
} from "lucide-react";
import { GlassCard, Reveal, SectionHeading } from "@/components/drishti/primitives";
import { AnimatedNumber } from "@/components/drishti/animated-number";
import { useNav } from "@/components/drishti/shell";
import { TEAM_MEMBERS, TRUST_THRESHOLDS, VALIDATED_METRICS } from "@/lib/drishti";

// ── Local display data (numbers/citations pulled from @/lib/drishti — never hardcoded) ──

const RESOURCES: Array<{ title: string; desc: string; icon: LucideIcon; href: string }> = [
  {
    title: "GitHub — Team Neural Minds",
    desc: "github.com/team-neural-minds",
    icon: Github,
    href: "https://github.com",
  },
  {
    title: "Colab notebook — training & validation",
    desc: `End-to-end CNN training, ${VALIDATED_METRICS.runs.length}-seed validation runs and QWK ${VALIDATED_METRICS.qwk} evaluation.`,
    icon: NotebookPen,
    href: "https://colab.research.google.com",
  },
  {
    title: "MathWorks tools used",
    desc: "MATLAB toolboxes for image preprocessing experiments + MATLAB-to-python porting notes.",
    icon: Briefcase,
    href: "https://www.mathworks.com",
  },
];

const HONESTY_BULLETS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: Database, text: "Data: APTOS 2019 blindness detection — Aravind Eye Hospital (Kaggle)" },
  { icon: GraduationCap, text: "Vessel segmentation reference: STARE — Clemson University" },
  {
    icon: FlaskConical,
    text: `Validated on ${VALIDATED_METRICS.dataset} — research prototype, not a certified clinical device`,
  },
  {
    icon: Scale,
    text: `Trust thresholds identical everywhere: console, API, website (${TRUST_THRESHOLDS.HIGH} / ${TRUST_THRESHOLDS.MODERATE_LOW})`,
  },
];

/** One label/value row inside the PS 26038 card. */
function PsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-36 shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed text-foreground/90">{children}</dd>
    </div>
  );
}

export default function AboutView() {
  const { navigate } = useNav();

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      {/* 1 · Page header */}
      <SectionHeading
        eyebrow="TEAM NEURAL MINDS"
        title="Built for the last mile."
        sub="A Smart India Hackathon 2026 build — problem statement 26038 (MathWorks): affordable, trustworthy AI screening for diabetic retinopathy where ophthalmologists are 100 km away."
      />

      {/* 2 · Team cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_MEMBERS.map((m, i) => (
          <Reveal key={m.initials} delay={i * 0.05} className="h-full">
            <GlassCard hover className="h-full">
              <div className="flex items-start gap-4">
                <div
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold"
                  style={{ backgroundColor: `${m.color}26`, color: m.color, boxShadow: `0 0 18px ${m.color}1f` }}
                >
                  {m.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-foreground">{m.name}</h3>
                  <p className="mt-0.5 text-sm font-medium text-[#22D3EE]">{m.role}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{m.note}</p>
                </div>
              </div>
            </GlassCard>
          </Reveal>
        ))}
      </div>

      {/* 3 · PS 26038 details */}
      <Reveal className="mt-14 sm:mt-16">
        <div className="glass-strong rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
              <Target className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Problem statement · SIH 2026 PS 26038
            </h2>
          </div>

          <dl className="mt-6 space-y-4">
            <PsRow label="Theme">MedTech / Bioinformatics · HealthTech</PsRow>
            <PsRow label="Organization">MathWorks Tools</PsRow>
            <PsRow label="Domain">AI screening for diabetic retinopathy</PsRow>
            <PsRow label="Our answer">
              Trust-gated screening: quality gate → lesion evidence → CNN grading → Grad-CAM → trust routing{" "}
              <span className="text-[#22D3EE]">
                (HIGH ≥ {TRUST_THRESHOLDS.HIGH} auto · MODERATE {TRUST_THRESHOLDS.MODERATE_LOW}–{TRUST_THRESHOLDS.HIGH} doctor ·
                LOW &lt; {TRUST_THRESHOLDS.MODERATE_LOW} urgent)
              </span>
            </PsRow>
          </dl>

          <div className="mt-7 border-t border-white/8 pt-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#22D3EE]/15 bg-white/[0.02] p-4 text-center">
                <div className="font-display text-2xl font-bold text-[#22D3EE]">
                  <AnimatedNumber value={VALIDATED_METRICS.sensitivity} decimals={1} suffix="%" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Sensitivity · referable DR</div>
              </div>
              <div className="rounded-xl border border-[#22D3EE]/15 bg-white/[0.02] p-4 text-center">
                <div className="font-display text-2xl font-bold text-[#22D3EE]">
                  <AnimatedNumber value={VALIDATED_METRICS.specificity} decimals={1} suffix="%" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Specificity</div>
              </div>
              <div className="rounded-xl border border-[#22D3EE]/15 bg-white/[0.02] p-4 text-center">
                <div className="font-display text-2xl font-bold text-[#22D3EE]">
                  <AnimatedNumber value={VALIDATED_METRICS.qwk} decimals={3} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">QWK · quadratic weighted κ</div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground/80">
              Validated on {VALIDATED_METRICS.dataset} · {VALIDATED_METRICS.runs.length} training runs — full table in the Validation view.
            </p>
          </div>
        </div>
      </Reveal>

      {/* 4 · Links & resources */}
      <div className="mt-14 sm:mt-16">
        <Reveal>
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Links &amp; resources</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Where the work lives — code, training, tooling, and the offline demo console.
          </p>
        </Reveal>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {RESOURCES.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.05} className="h-full">
              <a
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="glass-card glass-card-hover group flex h-full items-start justify-between gap-4 rounded-xl p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
                    <r.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-display text-base font-semibold text-foreground">{r.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{r.desc}</span>
                  </span>
                </span>
                <ArrowUpRight
                  className="mt-1 h-4 w-4 shrink-0 text-[#22D3EE] opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </a>
            </Reveal>
          ))}
          <Reveal delay={0.15} className="h-full">
            <button
              type="button"
              onClick={() => navigate("screening")}
              className="glass-card glass-card-hover group flex h-full w-full items-start justify-between gap-4 rounded-xl p-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
                  <Terminal className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-display text-base font-semibold text-foreground">DRISHTI console — offline demo</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    Same pipeline runs 100% offline on a laptop for stage demos.
                  </span>
                </span>
              </span>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0 text-[#22D3EE] opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
          </Reveal>
        </div>
      </div>

      {/* 5 · Data credits & license honesty */}
      <Reveal className="mt-14 sm:mt-16">
        {/* amber border via inline style — .glass-card is unlayered CSS, so Tailwind border utilities can't override it */}
        <div
          className="glass-card rounded-2xl p-6 sm:p-8"
          style={{ borderColor: "rgba(251,191,36,0.4)", boxShadow: "0 0 28px rgba(251,191,36,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FBBF24]/10 text-[#FBBF24]">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">Data &amp; honesty</h2>
          </div>

          <ul className="mt-5 space-y-3.5">
            {HONESTY_BULLETS.map((b) => (
              <li key={b.text} className="flex items-start gap-3">
                <b.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" aria-hidden="true" />
                <span className="text-sm leading-relaxed text-foreground/85">{b.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-start gap-2.5 border-t border-white/8 pt-4">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              All dashboard/demo records on this site are simulated for demonstration — labeled as demo.
            </p>
          </div>
        </div>
      </Reveal>

      {/* 6 · Footer CTA */}
      <Reveal className="mt-14 sm:mt-16">
        <div className="glass-strong rounded-2xl px-6 py-10 text-center sm:px-10 sm:py-12">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Want to see the accountability layer in action?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Run a live screening — every grade arrives with evidence, a Grad-CAM heatmap and an honest trust score.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate("screening")}
              className="btn-glow-cyan inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#22D3EE] px-7 py-3 font-display text-base font-semibold text-[#04121c] transition-all"
            >
              <ScanEye className="h-5 w-5" aria-hidden="true" /> Launch Screening
            </button>
            <button
              type="button"
              onClick={() => navigate("how")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#22D3EE]/40 bg-white/[0.03] px-7 py-3 font-display text-base font-semibold text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
            >
              <Workflow className="h-5 w-5" aria-hidden="true" /> Meet the pipeline
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
