"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Clock3,
  FileDown,
  History,
  Loader2,
  RotateCcw,
  ScanEye,
  Send,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@/components/drishti/animated-number";
import { GlassCard, Reveal, SectionHeading, StatusChip, TrustChip, trustColors } from "@/components/drishti/primitives";
import { RetinaView } from "@/components/drishti/retina-view";
import { ConfBar, ScoreDial } from "@/components/drishti/score-dial";
import { StageStepper, type StageDef, type StageState } from "@/components/drishti/stage-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMO_CASES,
  ICDR_CLASSES,
  PROB_LABELS,
  TRUST_THRESHOLDS,
  type EvidenceResult,
  type ScreeningResult,
} from "@/lib/drishti";
import { downloadReportPdf } from "@/lib/report-pdf";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "done" | "rejected" | "error";

interface RecentRun {
  patient_id: string;
  created_at: string;
  grade: string;
  class_level: number;
  trust_level: "HIGH" | "MODERATE" | "LOW";
  status: string;
  reviewed_by?: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/* ── Pipeline stage definitions (durations are injected from result.timings_ms) ── */
const STAGE_BASE: Array<{ key: string; label: string; desc: string }> = [
  { key: "gate", label: "Trust Gate", desc: "Blur & illumination check — bad photos never reach the AI" },
  { key: "evidence", label: "Evidence Engine", desc: "Microaneurysms · hemorrhages · exudates · DME zone" },
  { key: "classify", label: "CNN Grading", desc: "Torch CNN scores ICDR 0–4 probabilities" },
  { key: "explain", label: "Grad-CAM + Consistency", desc: "Heatmap ↔ lesion-centroid agreement (cross-mask)" },
  { key: "trust", label: "Trust Routing", desc: "Fused trust score → auto-clear, review or refer" },
];

const LESION_CHIPS: Array<{ key: string; label: string; countKey: "ma_count" | "hem_count" | "ex_count"; color: string }> = [
  { key: "ma", label: "MA", countKey: "ma_count", color: "#F87171" },
  { key: "hem", label: "HEM", countKey: "hem_count", color: "#FB923C" },
  { key: "ex", label: "EX", countKey: "ex_count", color: "#FBBF24" },
];

const EVIDENCE_TILES: Array<{
  key: string;
  i18nKey: string;
  countKey: "ma_count" | "hem_count" | "ex_count" | "vessel_density_pct";
  color: string;
  decimals: number;
  suffix: string;
}> = [
  { key: "ma", i18nKey: "ev.ma", countKey: "ma_count", color: "#F87171", decimals: 0, suffix: "" },
  { key: "hem", i18nKey: "ev.hem", countKey: "hem_count", color: "#FB923C", decimals: 0, suffix: "" },
  { key: "ex", i18nKey: "ev.ex", countKey: "ex_count", color: "#FBBF24", decimals: 0, suffix: "" },
  { key: "vessel", i18nKey: "ev.vessel", countKey: "vessel_density_pct", color: "#22D3EE", decimals: 1, suffix: "%" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function buildStages(t: ScreeningResult["timings_ms"]): StageDef[] {
  const durations: Array<number | undefined> = [t.gate, t.evidence, t.classify, t.explain, undefined];
  return STAGE_BASE.map((s, i) => ({ ...s, durationMs: durations[i] }));
}

/** Derive per-stage states from the elapsed clock + the backend's own cumulative timings. */
function computeStates(res: ScreeningResult, elapsed: number): StageState[] {
  const t = res.timings_ms;
  const b1 = t.gate;
  const b2 = b1 + t.evidence;
  const b3 = b2 + t.classify;
  const trustStart = b3 + (t.total - b3) * 0.55;
  if (!res.gate.accepted) {
    return elapsed < b1
      ? ["running", "pending", "pending", "pending", "pending"]
      : ["failed", "pending", "pending", "pending", "pending"];
  }
  const at = (end: number, start: number): StageState => (elapsed >= end ? "done" : elapsed >= start ? "running" : "pending");
  return [at(b1, 0), at(b2, b1), at(b3, b2), at(trustStart, b3), at(t.total, trustStart)];
}

/** Grad-CAM heat blob over an uploaded photograph (normalized → % positioning). */
function GradcamOverlay({ gc, delay = 0 }: { gc: EvidenceResult["gradcam"]; delay?: number }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute rounded-full mix-blend-screen blur-sm"
      style={{
        left: `${gc.cx * 100}%`,
        top: `${gc.cy * 100}%`,
        width: `${gc.rx * 200}%`,
        height: `${gc.ry * 200}%`,
        transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(255,248,184,.95), rgba(255,176,32,.75) 35%, rgba(255,45,0,0) 70%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: Math.min(1, Math.max(0.45, gc.intensity)) }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
    />
  );
}

function RejectedStamp() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.18 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="-rotate-12 rounded-lg border-2 border-[#F87171] bg-[#1a0505]/85 px-5 py-2.5 font-display text-xl font-bold tracking-[0.3em] text-[#F87171] shadow-[0_0_36px_rgba(248,113,113,0.35)] sm:text-2xl">
        REJECTED
      </div>
    </motion.div>
  );
}

function ProbabilityBars({ res }: { res: ScreeningResult }) {
  const lv = res.classification.class_level;
  return (
    <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {PROB_LABELS.map((label, i) => (
        <ConfBar
          key={label}
          label={label}
          value={res.classification.probabilities[label] ?? 0}
          color={ICDR_CLASSES[i].color}
          active={i === lv}
          delay={i * 80}
        />
      ))}
    </div>
  );
}

function ReferralTimeline({ res }: { res: ScreeningResult }) {
  const { t } = useLang();
  const cls = ICDR_CLASSES[res.classification.class_level] ?? ICDR_CLASSES[0];
  const steps = [
    {
      title: t("screen.rt.screened"),
      detail: new Date(res.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      tone: "#22D3EE",
    },
    {
      title: t("screen.rt.graded"),
      detail: `${cls.short} · ${(res.classification.confidence * 100).toFixed(1)}% ${t("screen.rt.conf")}`,
      tone: cls.color,
    },
    {
      title: res.trust.route,
      detail: t("screen.rt.trustDetail", {
        s: res.trust.trust_score.toFixed(2),
        level: t(`trustLevel.${res.trust.trust_level}`),
      }),
      tone: trustColors[res.trust.trust_level],
    },
    {
      title: t(`icdr.action.${cls.level}`),
      detail: t("screen.rt.policy"),
      tone: cls.color,
    },
  ];
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className="absolute left-[7px] top-5 h-full w-px bg-white/10" />}
          <span
            aria-hidden
            className="mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2"
            style={{ borderColor: s.tone, background: i === steps.length - 1 ? s.tone : "#0A1628", boxShadow: `0 0 10px ${s.tone}55` }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug" style={{ color: s.tone }}>
              {s.title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ScreeningView() {
  const { t } = useLang();
  const [patientId, setPatientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [awaiting, setAwaiting] = useState(false);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [runNonce, setRunNonce] = useState(0);
  const [recent, setRecent] = useState<RecentRun[] | null>(null);
  // "Send to review queue" — persisted routing (PATCH → server-side ROUTED audit event)
  const [queueing, setQueueing] = useState(false);
  const [queuedFor, setQueuedFor] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<number | null>(null);
  const lastAttemptRef = useRef<{ pid: string; file: File | null }>({ pid: "", file: null });

  const loadRecent = useCallback((quiet = false) => {
    if (!quiet) setRecent(null);
    fetch("/api/patients")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d: { patients?: RecentRun[] }) => {
        setRecent((d.patients ?? []).slice(0, 6));
      })
      .catch(() => {
        setRecent([]);
      });
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    return () => {
      if (clockRef.current !== null) window.clearInterval(clockRef.current);
    };
  }, []);

  const stopClock = () => {
    if (clockRef.current !== null) {
      window.clearInterval(clockRef.current);
      clockRef.current = null;
    }
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  const acceptFile = (f: File | null | undefined) => {
    if (!f || phase === "running" || phase === "done" || phase === "rejected") return;
    if (!f.type.startsWith("image/")) {
      toast.error("That's not an image — drop a PNG/JPG fundus photograph");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  /** Play the stage timeline using the backend's own stage timings (50 ms clock). */
  const startClock = (res: ScreeningResult) => {
    stopClock();
    const t = res.timings_ms;
    const rejected = !res.gate.accepted;
    const stopAt = rejected ? t.gate + 900 : t.total + 350;
    let el = 0;
    clockRef.current = window.setInterval(() => {
      el += 50;
      setElapsed(el);
      if (el < stopAt) return;
      stopClock();
      loadRecent(true);
      if (rejected) {
        setPhase("rejected");
        toast.error("Quality gate rejected the image — recapture required");
      } else {
        setPhase("done");
        const lvl = res.trust.trust_level;
        const routed =
          res.status === "URGENT" ? "urgent referral" : res.status === "NEEDS_REVIEW" ? "queued for review" : "auto-cleared";
        const msg = `Screening complete — ${lvl} trust (${res.trust.trust_score.toFixed(2)}) · ${routed}`;
        if (lvl === "HIGH") toast.success(msg);
        else if (lvl === "MODERATE") toast.warning(msg);
        else toast.error(msg);
      }
    }, 50);
  };

  const startRun = async (pid: string, f: File | null) => {
    const id = pid.trim();
    if (!id) {
      toast.error("Enter a patient ID or pick a demo case");
      return;
    }
    if (phase === "running") return;
    lastAttemptRef.current = { pid: id, file: f };
    stopClock();
    setPhase("running");
    setAwaiting(true);
    setResult(null);
    setElapsed(0);
    setErrorMsg("");
    setRunNonce((n) => n + 1);
    try {
      let res: Response;
      if (f) {
        const fd = new FormData();
        fd.append("patient_id", id);
        fd.append("file", f);
        res = await fetch("/api/screen", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: id }),
        });
      }
      const payload: unknown = await res.json().catch(() => null);
      const data = payload as ScreeningResult | null;
      if (!res.ok || !data || !data.timings_ms) {
        const msg = (payload as { error?: string } | null)?.error ?? `Pipeline error (${res.status})`;
        throw new Error(msg);
      }
      setResult(data);
      setAwaiting(false);
      startClock(data);
    } catch (e) {
      setAwaiting(false);
      setErrorMsg(e instanceof Error ? e.message : "The screening pipeline failed unexpectedly.");
      setPhase("error");
    }
  };

  const runPreset = (id: string) => {
    if (phase === "running") return;
    setPatientId(id);
    clearFile();
    void startRun(id, null);
  };

  const backToIdle = () => {
    stopClock();
    setResult(null);
    setElapsed(0);
    setAwaiting(false);
    setErrorMsg("");
    setPhase("idle");
  };

  const resetAll = () => {
    stopClock();
    clearFile();
    setPatientId("");
    setResult(null);
    setElapsed(0);
    setAwaiting(false);
    setErrorMsg("");
    setPhase("idle");
    setQueuedFor(null);
  };

  /** Persist the routing decision: PATCH status → server appends a ROUTED audit
   *  event (the case was never signed off, so the status write is a routing).
   *  The dashboard's register + activity feed pick it up on next refresh. */
  const handleSendToReview = async () => {
    if (!result || queueing || queuedFor === result.patient_id) return;
    if (result.status !== "NEEDS_REVIEW" && result.status !== "URGENT") return;
    setQueueing(true);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(result.patient_id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: result.status,
          reviewed_by: "Camp screening desk",
          note: `Routed to ${result.status === "URGENT" ? "the urgent referral queue" : "the review queue"} from live screening`,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      setQueuedFor(result.patient_id);
      toast.success(t("screen.toastQueued"));
      loadRecent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("screen.toastQueueFail"));
    } finally {
      setQueueing(false);
    }
  };

  /* ── Derived timeline values (meaningful once a result exists) ── */
  const tms = result?.timings_ms ?? null;
  const rejected = result ? !result.gate.accepted : false;
  const b1 = tms ? tms.gate : 0;
  const b2 = tms ? tms.gate + tms.evidence : 0;
  const b3 = tms ? tms.gate + tms.evidence + tms.classify : 0;
  const trustStart = tms ? b3 + (tms.total - b3) * 0.55 : Number.POSITIVE_INFINITY;
  const gateDone = Boolean(result) && elapsed >= b1;
  const evidenceDone = Boolean(result) && elapsed >= b2;
  const scanActive = Boolean(result) && (rejected ? !gateDone : elapsed < b3);
  const lv = result ? result.classification.class_level : 0;
  const predCls = result ? (ICDR_CLASSES[lv] ?? ICDR_CLASSES[0]) : ICDR_CLASSES[0];
  const gc = result?.evidence.gradcam ?? null;
  const stages: StageDef[] = tms ? buildStages(tms) : STAGE_BASE;
  const states: StageState[] = result && tms ? computeStates(result, elapsed) : STAGE_BASE.map(() => "pending" as StageState);
  const runIdx = states.indexOf("running");
  const currentStageLabel =
    rejected && gateDone ? "HALTED — QUALITY GATE" : runIdx >= 0 ? STAGE_BASE[runIdx].label.toUpperCase() : "PIPELINE RUN";

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <SectionHeading
        align="left"
        eyebrow={t("screen.eyebrow")}
        title={
          <>
            {t("screen.title.a")}
            <span className="text-glow-cyan">{t("screen.title.b")}</span>
          </>
        }
        sub={t("screen.sub")}
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* ──────────────── LEFT — controls ──────────────── */}
        <Reveal className="lg:sticky lg:top-24">
          <GlassCard>
            <div className="space-y-5">
              {/* patient ID */}
              <div className="space-y-1.5">
                <label htmlFor="patient-id" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Patient ID
                </label>
                <Input
                  id="patient-id"
                  placeholder="Patient ID — e.g. RAMPUR-0201"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void startRun(patientId, file);
                  }}
                  disabled={phase === "running"}
                  className="h-11 border-white/15 bg-white/[0.03] font-display tracking-wide"
                />
              </div>

              {/* upload zone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fundus photograph</span>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#22D3EE]/30 px-2.5 text-xs font-medium text-[#22D3EE] transition-colors hover:bg-[#22D3EE]/10"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    Use camera
                  </button>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload fundus photograph — drag and drop, or press Enter to browse"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (phase !== "running") setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-all duration-300",
                    dragOver
                      ? "border-[#22D3EE] bg-[#22D3EE]/5 shadow-[0_0_28px_rgba(34,211,238,0.25)]"
                      : "border-white/15 hover:border-[#22D3EE]/50 hover:bg-white/[0.02]",
                    phase === "running" && "pointer-events-none opacity-60"
                  )}
                >
                  {previewUrl && file ? (
                    <div className="w-full space-y-2 text-left">
                      <img
                        src={previewUrl}
                        alt="Selected fundus photograph preview"
                        className="aspect-video w-full rounded-lg object-cover"
                      />
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{file.name}</span>
                        <span className="tabular shrink-0">{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-[#22D3EE]/70" aria-hidden />
                      <p className="text-sm font-medium">
                        Drop a fundus image or <span className="text-[#22D3EE]">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground">PNG / JPG — the quality gate checks it first</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    acceptFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    acceptFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* demo cases */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Demo cases — tap to run instantly
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_CASES.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => runPreset(c.id)}
                      disabled={phase === "running"}
                      className={cn(
                        "min-h-[56px] rounded-lg border bg-white/[0.02] p-2.5 text-left transition-all duration-200 hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50",
                        c.id === "NORMAL-001"
                          ? "border-[#34D399]/35 hover:border-[#34D399]/80 hover:bg-[#34D399]/5"
                          : c.id === "BADPHOTO-001"
                            ? "border-[#F87171]/35 hover:border-[#F87171]/80 hover:bg-[#F87171]/5"
                            : "border-[#22D3EE]/30 hover:border-[#22D3EE]/80 hover:bg-[#22D3EE]/5",
                        i === DEMO_CASES.length - 1 && "col-span-2"
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-1.5">
                        <span className="font-display text-sm font-semibold">{c.label}</span>
                        <span className="text-[10px] tracking-wide text-muted-foreground/70">{c.id}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground line-clamp-2">{c.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* start */}
              <Button
                onClick={() => void startRun(patientId, file)}
                disabled={phase === "running"}
                className="btn-glow-cyan h-12 w-full bg-[#22D3EE] font-display text-base font-semibold text-[#04121c] hover:bg-[#22D3EE]/90"
              >
                {phase === "running" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    {t("screen.running")}
                  </>
                ) : (
                  <>
                    <ScanEye className="h-5 w-5" aria-hidden />
                    {t("screen.start")}
                  </>
                )}
              </Button>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Web demo simulates the on-device pipeline (torch CNN + Grad-CAM) end-to-end. Thresholds identical: HIGH ≥{" "}
                {TRUST_THRESHOLDS.HIGH} · MODERATE {TRUST_THRESHOLDS.MODERATE_LOW}–{TRUST_THRESHOLDS.HIGH} · LOW &lt;{" "}
                {TRUST_THRESHOLDS.MODERATE_LOW}. Demo only — not a medical device.
              </p>

              {/* recent runs — live from the screening register */}
              <div className="space-y-1.5 border-t border-white/8 pt-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("screen.registerStrip")}
                </span>
                {!recent ? (
                  <div className="space-y-1.5 pt-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="skeleton-shimmer h-9 w-full rounded-lg" />
                    ))}
                  </div>
                ) : recent.length === 0 ? (
                  <p className="pt-1 text-[11px] text-muted-foreground/70">No screenings yet — your runs will appear here.</p>
                ) : (
                  <ul className="drishti-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {recent.map((r) => {
                      const dot = ICDR_CLASSES[r.class_level]?.color ?? "#8296b3";
                      return (
                        <li key={r.patient_id}>
                          <button
                            type="button"
                            onClick={() => runPreset(r.patient_id)}
                            disabled={phase === "running"}
                            className="group flex min-h-9 w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-left transition-all duration-200 hover:border-[#22D3EE]/40 hover:bg-[#22D3EE]/5 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}66` }} />
                            <span className="font-display min-w-0 flex-1 truncate text-xs font-semibold">{r.patient_id}</span>
                            {r.reviewed_by && (
                              <span
                                className="flex shrink-0 items-center text-[#34D399]"
                                title={`Signed off by ${r.reviewed_by}`}
                                aria-label="Signed off by a doctor"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                            )}
                            <span className="hidden truncate text-[10px] text-muted-foreground sm:block">{r.grade}</span>
                            <span
                              className="flex shrink-0 items-center gap-1 text-[10px] tabular"
                              style={{ color: trustColors[r.trust_level] }}
                            >
                              <Clock3 className="h-3 w-3" aria-hidden="true" />
                              {timeAgo(r.created_at)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </GlassCard>
        </Reveal>

        {/* ──────────────── RIGHT — the live pipeline ──────────────── */}
        <Reveal delay={0.08}>
          <div className="space-y-6" aria-live="polite">
            {/* idle placeholder */}
            {phase === "idle" && (
              <GlassCard className="flex min-h-[480px] flex-col items-center justify-center gap-5 text-center">
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-[#22D3EE]/30 bg-[#22D3EE]/[0.04]"
                  aria-hidden
                >
                  <ScanEye className="h-10 w-10 text-[#22D3EE]/70" />
                </div>
                <div>
                  <p className="font-display text-xl font-semibold">The pipeline appears here</p>
                  <p className="mt-1 text-sm text-muted-foreground">Run a screening — stages light up in real time (~6 s)</p>
                </div>
                <ol className="w-full max-w-xs space-y-2.5 border-t border-white/10 pt-5 text-left">
                  {STAGE_BASE.map((s, i) => (
                    <li key={s.key} className="flex items-center gap-3 text-sm text-muted-foreground/60">
                      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-[11px]">
                        {i + 1}
                      </span>
                      {s.label}
                    </li>
                  ))}
                </ol>
              </GlassCard>
            )}

            {/* booting (awaiting API) */}
            {phase === "running" && (!result || awaiting) && (
              <GlassCard className="flex min-h-[480px] flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#22D3EE]" aria-hidden />
                <div>
                  <p className="font-display text-lg font-semibold text-[#22D3EE]">Booting on-device pipeline…</p>
                  <p className="mt-1 text-sm text-muted-foreground">loading torch CNN · warming Grad-CAM hooks</p>
                </div>
                <div className="skeleton-shimmer h-1.5 w-48 rounded-full" aria-hidden />
              </GlassCard>
            )}

            {/* live run + rejected-halt view */}
            {(phase === "running" || phase === "rejected") && result && (
              <GlassCard className="border-[#22D3EE]/25">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="chip border-[#22D3EE]/40 text-[#22D3EE]">
                      <span className="relative flex h-1.5 w-1.5" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22D3EE] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22D3EE]" />
                      </span>
                      {t("screen.live")}
                    </span>
                    <span className="font-display text-sm font-bold tracking-wide">{result.patient_id}</span>
                  </div>
                  <span
                    className={cn(
                      "chip",
                      rejected && gateDone ? "border-[#F87171]/40 text-[#F87171]" : "border-white/15 text-muted-foreground"
                    )}
                  >
                    {currentStageLabel}
                  </span>
                </div>

                <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
                  {/* image / procedural retina */}
                  <div className="relative mx-auto aspect-square w-full max-w-md shrink-0 xl:mx-0">
                    {previewUrl ? (
                      <>
                        <img
                          src={previewUrl}
                          alt={`Fundus photograph being screened for ${result.patient_id}`}
                          className={cn(
                            "h-full w-full rounded-xl object-cover",
                            rejected && gateDone && "blur-[2px] saturate-[0.6]"
                          )}
                        />
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10" aria-hidden />
                        {scanActive && <div className="scanline" aria-hidden="true" />}
                        {gateDone &&
                          !rejected && (
                            <div className="absolute right-2.5 top-3 flex flex-col items-end gap-2">
                              {LESION_CHIPS.map((c, i) => (
                                <motion.div
                                  key={c.key}
                                  initial={{ opacity: 0, x: 14 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.25 + i * 0.25, duration: 0.3, ease: "easeOut" }}
                                  className="glass-strong rounded-full px-3 py-1.5 text-xs font-semibold"
                                  style={{ color: c.color, borderColor: `${c.color}55` }}
                                >
                                  {c.label} <AnimatedNumber value={result.evidence[c.countKey]} prefix="×" />
                                </motion.div>
                              ))}
                            </div>
                          )}
                        {!rejected && elapsed >= b3 && gc && <GradcamOverlay gc={gc} />}
                      </>
                    ) : (
                      <RetinaView
                        severity={rejected ? 0 : Math.max(0, lv)}
                        dmeRisk={result.evidence.dme_risk}
                        layers={
                          rejected
                            ? { vessels: true, ma: false, hem: false, ex: false, dme: false, gradcam: false }
                            : {
                                vessels: true,
                                ma: evidenceDone,
                                hem: evidenceDone,
                                ex: evidenceDone,
                                dme: evidenceDone && result.evidence.dme_risk,
                                gradcam: !rejected && elapsed >= b3,
                              }
                        }
                        blur={rejected ? 0.55 : 0}
                        scanning={scanActive}
                        rejected={rejected && gateDone}
                        lesions={evidenceDone && !rejected ? result.evidence.lesions : undefined}
                        gradcam={!rejected && elapsed >= b3 && gc ? gc : undefined}
                        vesselDraw={!rejected && elapsed < b2}
                        className="h-full w-full"
                      />
                    )}

                    {/* shared gate-quality overlay */}
                    {gateDone && !rejected && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="glass-strong absolute bottom-3 left-3 rounded-xl p-1.5"
                      >
                        <ScoreDial value={result.gate.quality_score} size={110} tone="auto" sublabel={t("screen.quality")} />
                      </motion.div>
                    )}
                    {/* rejection stamp (photograph path — RetinaView stamps itself) */}
                    {previewUrl && rejected && gateDone && <RejectedStamp />}
                  </div>

                  {/* stepper */}
                  <div className="min-w-0 flex-1">
                    <StageStepper stages={stages} states={states} />
                    {rejected && gateDone && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        role="alert"
                        className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 p-3.5 text-sm leading-relaxed text-[#F87171]"
                      >
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>{t("screen.haltedBanner")}</span>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* stage 3 — CNN probabilities */}
                {!rejected && evidenceDone && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="mt-6 border-t border-white/10 pt-5"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        CNN probabilities — ICDR 0–4
                      </p>
                      {elapsed >= b3 && (
                        <span className="chip" style={{ color: predCls.color, borderColor: `${predCls.color}55` }}>
                          Predicted: {result.classification.predicted_class}
                        </span>
                      )}
                    </div>
                    <ProbabilityBars res={result} />
                  </motion.div>
                )}

                {/* stage 5 — trust routing */}
                {!rejected && elapsed >= trustStart && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="mt-6 flex flex-col items-center gap-4 border-t border-white/10 pt-5 sm:flex-row sm:justify-center sm:gap-10"
                  >
                    <ScoreDial value={result.trust.trust_score} size={140} label={t("screen.trustScore")} sublabel={result.trust.trust_level} />
                    <div className="text-center sm:text-left">
                      <TrustChip level={result.trust.trust_level} />
                      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{result.trust.route}</p>
                    </div>
                  </motion.div>
                )}
              </GlassCard>
            )}

            {/* done — clinical report card */}
            {phase === "done" && result && (
              <motion.div
                key={`report-${result.patient_id}-${runNonce}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                role="article"
                aria-label={`Clinical report for ${result.patient_id}`}
                className="card-accent-top glass-strong rounded-2xl p-5 shadow-[0_0_60px_rgba(34,211,238,0.1)] sm:p-6"
              >
                {/* header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-display text-xl font-bold tracking-wide">{result.patient_id}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(result.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · DRISHTI
                      web demo
                    </p>
                  </div>
                  <StatusChip status={result.status} />
                </div>

                {/* verdict row + final annotated frame */}
                <div className="mt-5 grid items-center gap-5 md:grid-cols-[minmax(0,230px)_minmax(0,1fr)_auto]">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black">
                    {previewUrl ? (
                      <>
                        <img
                          src={previewUrl}
                          alt="Final screened fundus photograph with Grad-CAM overlay"
                          className="h-full w-full object-cover"
                        />
                        {gc && <GradcamOverlay gc={gc} delay={0.25} />}
                      </>
                    ) : (
                      <RetinaView
                        severity={Math.max(0, lv)}
                        dmeRisk={result.evidence.dme_risk}
                        layers={{ vessels: true, ma: true, hem: true, ex: true, dme: result.evidence.dme_risk, gradcam: true }}
                        lesions={result.evidence.lesions}
                        gradcam={result.evidence.gradcam}
                        className="h-full w-full"
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("screen.aiGrade")}</p>
                    <p className="mt-1 font-display text-2xl font-bold leading-tight" style={{ color: predCls.color }}>
                      {result.classification.predicted_class}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("screen.confidence")}{" "}
                      <span className="tabular font-semibold text-foreground">
                        {(result.classification.confidence * 100).toFixed(1)}%
                      </span>
                    </p>
                    <div className="mt-3">
                      <TrustChip level={result.trust.trust_level} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{result.trust.route}</p>
                  </div>
                  <div className="justify-self-center md:justify-self-end">
                    <ScoreDial value={result.trust.trust_score} size={110} label={t("screen.trustScore")} />
                  </div>
                </div>

                {/* DME alert */}
                {result.evidence.dme_risk && (
                  <div
                    role="alert"
                    className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 p-3.5 text-sm leading-relaxed text-[#F87171]"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{result.evidence.dme_message}</span>
                  </div>
                )}

                {/* measurement tiles */}
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <ScoreDial value={result.gate.quality_score} size={90} label={t("screen.quality")} />
                  </div>
                  <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <ScoreDial value={result.explainability.consistency} size={90} label={t("screen.consistency")} />
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="font-display text-2xl font-bold text-[#22D3EE]">
                      <AnimatedNumber value={result.explainability.centroid_distance_dd} decimals={2} suffix=" DD" />
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t("screen.centroid")}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="font-display text-2xl font-bold text-[#22D3EE]">
                      <AnimatedNumber value={result.explainability.region_overlap * 100} decimals={0} suffix="%" />
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t("screen.regionOverlap")}</p>
                  </div>
                </div>

                {/* evidence tiles */}
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {EVIDENCE_TILES.map((tile) => (
                    <div key={tile.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tile.color }}>
                        {t(tile.i18nKey)}
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold">
                        <AnimatedNumber value={result.evidence[tile.countKey]} decimals={tile.decimals} suffix={tile.suffix} />
                      </p>
                    </div>
                  ))}
                </div>

                {/* probability bars */}
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("screen.cnnProbs")}
                  </p>
                  <ProbabilityBars res={result} />
                </div>

                {/* referral timeline */}
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("screen.referralTimeline")}</p>
                  <ReferralTimeline res={result} />
                </div>

                {/* timings footer */}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                  <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t("screen.pipeline")}</span>
                  {(
                    [
                      [t("screen.t.gate"), result.timings_ms.gate],
                      [t("screen.t.evidence"), result.timings_ms.evidence],
                      [t("screen.t.cnn"), result.timings_ms.classify],
                      [t("screen.t.explain"), result.timings_ms.explain],
                    ] as Array<[string, number]>
                  ).map(([label, ms]) => (
                    <span key={label} className="chip border-white/10 text-muted-foreground">
                      {label} {(ms / 1000).toFixed(1)}s
                    </span>
                  ))}
                  <span className="chip border-[#22D3EE]/40 text-[#22D3EE]">
                    {t("screen.t.total")} {(result.timings_ms.total / 1000).toFixed(1)}s
                  </span>
                </div>

                {/* actions */}
                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                  <Button
                    onClick={() => downloadReportPdf(result)}
                    className="btn-glow-cyan h-11 flex-1 bg-[#22D3EE] font-display font-semibold text-[#04121c] hover:bg-[#22D3EE]/90"
                  >
                    <FileDown className="h-4 w-4" aria-hidden />
                    {t("screen.pdf")}
                  </Button>
                  {(result.status === "NEEDS_REVIEW" || result.status === "URGENT") &&
                    (queuedFor === result.patient_id ? (
                      <span
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[#34D399]/45 bg-[#34D399]/10 font-display text-sm font-semibold text-[#34D399]"
                        title="Routing decision persisted — the case now sits in the doctor's review queue with a ROUTED audit event"
                        role="status"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        {t("screen.queuedChip")}
                      </span>
                    ) : (
                      <Button
                        onClick={() => void handleSendToReview()}
                        variant="outline"
                        disabled={queueing}
                        className="h-11 flex-1 border-[#22D3EE]/40 font-display font-semibold text-[#22D3EE] hover:bg-[#22D3EE]/10 disabled:cursor-wait disabled:opacity-60"
                      >
                        <Send className={cn("h-4 w-4", queueing && "animate-pulse")} aria-hidden />
                        {queueing ? t("screen.queuing") : t("screen.sendReview")}
                      </Button>
                    ))}
                  <Button
                    onClick={resetAll}
                    variant="outline"
                    className="h-11 border-white/15 font-display font-semibold hover:bg-white/5"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t("screen.new")}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* rejected — report-lite */}
            {phase === "rejected" && result && (
              <GlassCard className="border-[#F87171]/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#F87171]/40 bg-[#F87171]/10"
                      aria-hidden
                    >
                      <TriangleAlert className="h-5 w-5 text-[#F87171]" />
                    </div>
                    <div>
                      <p className="font-display text-lg font-bold text-[#F87171]">{t("screen.haltedTitle")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{result.gate.message}</p>
                    </div>
                  </div>
                  <StatusChip status="REJECTED" />
                </div>
                <div className="mt-5 grid items-center gap-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <ScoreDial value={result.gate.quality_score} size={90} sublabel={t("screen.quality")} />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Recapture before any AI runs — the gate is the safety net.</p>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                      <li>· Center the optic disc and macula in frame</li>
                      <li>· Steady the camera — no motion blur</li>
                      <li>· Ensure even illumination, no eyelash shadows</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                  <Button
                    onClick={backToIdle}
                    className="btn-glow-cyan h-11 flex-1 bg-[#22D3EE] font-display font-semibold text-[#04121c] hover:bg-[#22D3EE]/90"
                  >
                    <Camera className="h-4 w-4" aria-hidden />
                    Try again
                  </Button>
                  <Button
                    onClick={resetAll}
                    variant="outline"
                    className="h-11 border-white/15 font-display font-semibold hover:bg-white/5"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t("screen.new")}
                  </Button>
                </div>
              </GlassCard>
            )}

            {/* error */}
            {phase === "error" && (
              <GlassCard className="border-[#F87171]/40">
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <TriangleAlert className="h-8 w-8 text-[#F87171]" aria-hidden />
                  <p className="font-display text-lg font-semibold text-[#F87171]">Pipeline error</p>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    {errorMsg || "The screening pipeline failed unexpectedly."}
                  </p>
                  <Button
                    onClick={() => {
                      const attempt = lastAttemptRef.current;
                      if (attempt.pid) void startRun(attempt.pid, attempt.file);
                    }}
                    className="btn-glow-cyan mt-2 h-11 bg-[#22D3EE] px-8 font-display font-semibold text-[#04121c] hover:bg-[#22D3EE]/90"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Retry
                  </Button>
                </div>
              </GlassCard>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
