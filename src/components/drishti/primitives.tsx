"use client";

import { forwardRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CaseStatus, TrustLevel } from "@/lib/drishti";
import { useLang } from "@/lib/i18n";

/** Glassmorphism card — the core surface of the design system. */
export const GlassCard = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; hover?: boolean }>(
  function GlassCard({ children, className, hover = false }, ref) {
    return (
      <div ref={ref} className={cn("glass-card p-6", hover && "glass-card-hover", className)}>
        {children}
      </div>
    );
  }
);

/** Scroll-reveal wrapper — subtle rise + fade, 400ms ease-out. */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 24,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("mb-10", align === "center" ? "text-center" : "text-left", className)}>
      {eyebrow && (
        <Reveal>
          <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">{eyebrow}</span>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      </Reveal>
      {sub && (
        <Reveal delay={0.1}>
          <p className={cn("mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base", align === "center" && "mx-auto")}>
            {sub}
          </p>
        </Reveal>
      )}
    </div>
  );
}

const TRUST_STYLES: Record<TrustLevel, { chip: string; text: string; glow: string }> = {
  HIGH: { chip: "border-[#34D399]/40 bg-[#0A2E24]/80", text: "text-[#34D399]", glow: "shadow-[0_0_18px_rgba(52,211,153,0.25)]" },
  MODERATE: { chip: "border-[#FBBF24]/40 bg-[#2A2210]/80", text: "text-[#FBBF24]", glow: "shadow-[0_0_18px_rgba(251,191,36,0.25)]" },
  LOW: { chip: "border-[#F87171]/40 bg-[#2E0F12]/80", text: "text-[#F87171]", glow: "shadow-[0_0_18px_rgba(248,113,113,0.25)]" },
};

/** Trust level chip — THE consistent trust color language (green/amber/red). */
export function TrustChip({ level, className }: { level: TrustLevel; className?: string }) {
  const s = TRUST_STYLES[level];
  const { t } = useLang();
  const label = t(`trust.${level}`);
  return (
    <span className={cn("chip", s.chip, s.text, s.glow, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", level === "HIGH" ? "bg-[#34D399]" : level === "MODERATE" ? "bg-[#FBBF24]" : "bg-[#F87171]")} />
      {label}
    </span>
  );
}

export function StatusChip({ status, className }: { status: CaseStatus; className?: string }) {
  const map: Record<CaseStatus, { cls: string }> = {
    AUTO_CLEARED: { cls: "border-[#34D399]/40 text-[#34D399]" },
    NEEDS_REVIEW: { cls: "border-[#FBBF24]/40 text-[#FBBF24]" },
    URGENT: { cls: "border-[#F87171]/40 text-[#F87171]" },
    REJECTED: { cls: "border-white/25 text-muted-foreground" },
  };
  const { t } = useLang();
  const s = map[status];
  return <span className={cn("chip", s.cls, className)}>{t(`status.${status}`)}</span>;
}

export function TrustToneText({ level, children, className }: { level: TrustLevel; children: ReactNode; className?: string }) {
  return <span className={cn(TRUST_STYLES[level].text, className)}>{children}</span>;
}

export const trustColors: Record<TrustLevel, string> = {
  HIGH: "#34D399",
  MODERATE: "#FBBF24",
  LOW: "#F87171",
};
