"use client";

import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageState = "pending" | "running" | "done" | "failed";

export interface StageDef {
  key: string;
  label: string;
  desc: string;
  durationMs?: number;
}

/**
 * StageStepper — vertical 5-stage pipeline stepper.
 * Lights up stage by stage; laser-cyan runner, green check, red X for gate rejections.
 */
export function StageStepper({
  stages,
  states,
  compact = false,
}: {
  stages: StageDef[];
  states: StageState[];
  compact?: boolean;
}) {
  return (
    <ol className="relative flex flex-col" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const st = states[i] ?? "pending";
        const isLast = i === stages.length - 1;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {/* connector */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-[2px] rounded",
                  st === "done" ? "bg-gradient-to-b from-[#22D3EE] to-[#22D3EE]/30" : "bg-white/8"
                )}
              />
            )}
            {/* node */}
            <span
              className={cn(
                "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                st === "pending" && "border-white/15 bg-secondary text-muted-foreground",
                st === "running" && "border-[#22D3EE] bg-[#0A2A38] text-[#22D3EE] pulse-ring",
                st === "done" && "border-[#34D399]/60 bg-[#0A2E24] text-[#34D399]",
                st === "failed" && "border-[#F87171]/60 bg-[#2E0F12] text-[#F87171]"
              )}
            >
              {st === "done" && <Check className="h-4 w-4" />}
              {st === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
              {st === "failed" && <X className="h-4 w-4" />}
              {st === "pending" && <span className="tabular text-xs font-semibold">{i + 1}</span>}
            </span>
            {/* text */}
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-display text-sm font-semibold tracking-wide transition-colors",
                    st === "pending" && "text-muted-foreground",
                    st === "running" && "text-[#22D3EE] text-glow-cyan",
                    st === "done" && "text-foreground",
                    st === "failed" && "text-[#F87171]"
                  )}
                >
                  {s.label}
                </span>
                {st === "done" && s.durationMs ? (
                  <span className="tabular chip border-[#34D399]/30 text-[#34D399]">{(s.durationMs / 1000).toFixed(1)}s</span>
                ) : null}
                {st === "running" && <span className="chip border-[#22D3EE]/40 text-[#22D3EE]">running</span>}
                {st === "failed" && <span className="chip border-[#F87171]/40 text-[#F87171]">halted</span>}
              </div>
              {!compact && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
