"use client";

/**
 * Shared dark-theme recharts primitives — used by the Validation and Capacity
 * views so chart cards and tooltips stay pixel-identical across the site.
 */

// ────────────────────────────────────────────────────────────
// Section heading inside a chart section (page-level heading
// is the shared SectionHeading primitive).
// ────────────────────────────────────────────────────────────

export function BlockHeading({
  index,
  title,
  sub,
}: {
  index: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <span className="tabular font-display text-xs font-bold tracking-[0.25em] text-[#22D3EE]/70">{index}</span>
        <span className="h-px w-8 bg-gradient-to-r from-[#22D3EE]/50 to-transparent" />
        <h3 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h3>
      </div>
      {sub && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Dark recharts tooltip — shared by every chart on the site.
// Configure formatting via prefix/suffix/decimals for numeric
// labels, or labelFormatter/valueFormatter for custom output.
// ────────────────────────────────────────────────────────────

export interface DarkTipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
}

export interface DarkTipProps {
  active?: boolean;
  payload?: ReadonlyArray<DarkTipEntry>;
  label?: string | number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  labelDecimals?: number;
  /** Fully custom label text (wins over prefix + toFixed). */
  labelFormatter?: (label: string | number) => string;
  /** Fully custom value text (wins over toFixed + suffix). */
  valueFormatter?: (value: number, entry: DarkTipEntry, index: number) => string;
}

const TIP_MUTED = "#8296b3";

export function DarkTip({
  active,
  payload,
  label,
  prefix = "",
  suffix = "",
  decimals = 1,
  labelDecimals = 2,
  labelFormatter,
  valueFormatter,
}: DarkTipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#22D3EE]/25 bg-[#081120]/95 px-3 py-2 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
      {label !== undefined && (
        <div className="font-display font-semibold text-[#E6F1FF]">
          {labelFormatter
            ? labelFormatter(label)
            : `${prefix ? `${prefix} ` : ""}${typeof label === "number" ? label.toFixed(labelDecimals) : label}`}
        </div>
      )}
      <div className="mt-1 space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color ?? TIP_MUTED }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="tabular font-medium text-[#E6F1FF]">
              {valueFormatter
                ? valueFormatter(Number(entry.value ?? 0), entry, i)
                : `${typeof entry.value === "number" ? entry.value.toFixed(decimals) : entry.value}${suffix}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
