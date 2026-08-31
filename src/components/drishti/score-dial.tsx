"use client";

import { useEffect, useRef, useState } from "react";
import { TRUST_THRESHOLDS } from "@/lib/drishti";
import { cn } from "@/lib/utils";

export type DialTone = "auto" | "cyan" | "green" | "amber" | "red";

function toneColor(value: number, tone: DialTone): string {
  if (tone === "cyan") return "#22D3EE";
  if (tone === "green") return "#34D399";
  if (tone === "amber") return "#FBBF24";
  if (tone === "red") return "#F87171";
  // auto: trust language — green ≥ 0.76 · amber 0.55-0.76 · red < 0.55
  if (value >= TRUST_THRESHOLDS.HIGH) return "#34D399";
  if (value >= TRUST_THRESHOLDS.MODERATE_LOW) return "#FBBF24";
  return "#F87171";
}

export interface ScoreDialProps {
  /** 0..1 */
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
  tone?: DialTone;
  decimals?: number;
  /** animate from 0 to value on mount / value change */
  animate?: boolean;
  className?: string;
}

/**
 * ScoreDial — 270° arc gauge with animated sweep, tick marks and the big
 * tabular number in the middle. Used for quality score, trust score, consistency.
 */
export function ScoreDial({
  value,
  size = 150,
  label,
  sublabel,
  tone = "auto",
  decimals = 2,
  animate = true,
  className,
}: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const [display, setDisplay] = useState(0);
  const currentRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const apply = () => {
      currentRef.current = clamped;
      setDisplay(clamped);
    };
    cancelAnimationFrame(rafRef.current);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduced || currentRef.current === clamped) {
      rafRef.current = requestAnimationFrame(apply);
      return () => cancelAnimationFrame(rafRef.current);
    }
    const from = currentRef.current;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (clamped - from) * eased;
      currentRef.current = v;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [clamped, animate]);

  const color = toneColor(clamped, tone);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const ARC = 0.75; // 270°
  const arcLen = CIRC * ARC;
  const filled = arcLen * display;

  return (
    <div className={cn("flex flex-col items-center", className)} style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 110 110" className="h-full w-full -rotate-[225deg]">
          {/* track */}
          <circle
            cx="55"
            cy="55"
            r={R}
            fill="none"
            stroke="rgba(34,211,238,0.12)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${CIRC}`}
          />
          {/* value arc */}
          <circle
            cx="55"
            cy="55"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
            style={{
              transition: "stroke-dasharray 80ms linear, stroke 0.5s ease",
              filter: `drop-shadow(0 0 6px ${color}66)`,
            }}
          />
          {/* ticks */}
          {Array.from({ length: 13 }).map((_, i) => {
            const a = (i / 12) * ARC * 360;
            return (
              <line
                key={i}
                x1="55"
                y1="6"
                x2="55"
                y2="9.5"
                stroke="rgba(230,241,255,0.25)"
                strokeWidth="1.2"
                transform={`rotate(${a} 55 55)`}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular font-display font-bold leading-none" style={{ color, fontSize: size * 0.19 }}>
            {display.toFixed(decimals)}
          </span>
          {sublabel && <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{sublabel}</span>}
        </div>
      </div>
      {label && <span className="mt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>}
    </div>
  );
}

/** Horizontal confidence bar — classification probabilities */
export function ConfBar({
  label,
  value,
  color = "#22D3EE",
  active = false,
  delay = 0,
}: {
  label: string;
  value: number;
  color?: string;
  active?: boolean;
  delay?: number;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value * 100), 60 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={cn("truncate", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        <span className="tabular ml-2 font-medium" style={{ color: active ? color : undefined }}>
          {(value * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={1} aria-label={label}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${w}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: active ? `0 0 10px ${color}88` : undefined,
            transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
    </div>
  );
}
