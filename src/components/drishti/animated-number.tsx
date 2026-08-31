"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** ms — 0 jumps instantly; otherwise eases from the CURRENT value (safe for live drags) */
  duration?: number;
  className?: string;
  /** first render waits until scrolled into view */
  startOnVisible?: boolean;
}

/**
 * AnimatedNumber — eased count-up with tabular figures.
 * Always animates from the previously displayed value, so live-updating
 * callers (sliders, dials) get smooth deltas instead of restarts.
 * Respects prefers-reduced-motion (jumps instantly).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1400,
  className,
  startOnVisible = true,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const currentRef = useRef(0);
  const visibleRef = useRef(!startOnVisible);
  const rafRef = useRef(0);
  const ref = useRef<HTMLSpanElement>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    const animateTo = (target: number) => {
      cancelAnimationFrame(rafRef.current);
      const from = currentRef.current;
      const apply = () => {
        currentRef.current = target;
        setDisplay(target);
      };
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || duration <= 0 || from === target) {
        rafRef.current = requestAnimationFrame(apply);
        return;
      }
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = from + (target - from) * eased;
        currentRef.current = v;
        setDisplay(v);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    valueRef.current = value;

    if (visibleRef.current) {
      animateTo(value);
      return () => cancelAnimationFrame(rafRef.current);
    }

    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          visibleRef.current = true;
          obs.disconnect();
          animateTo(valueRef.current);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {prefix}
      {display.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
