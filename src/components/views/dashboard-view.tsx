"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ClipboardList,
  Crosshair,
  Download,
  FileDown,
  FileText,
  Info,
  ListChecks,
  RefreshCw,
  ScanEye,
  ScanLine,
  Search,
  SearchX,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedNumber } from "@/components/drishti/animated-number";
import { GlassCard, Reveal, SectionHeading, StatusChip, TrustChip } from "@/components/drishti/primitives";
import { RetinaView } from "@/components/drishti/retina-view";
import { ConfBar, ScoreDial } from "@/components/drishti/score-dial";
import { useNav } from "@/components/drishti/shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ICDR_CLASSES, type CaseStatus, type ScreeningResult, type TrustLevel } from "@/lib/drishti";
import { downloadRegisterPdf, downloadReportPdf, type RegisterRow } from "@/lib/report-pdf";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Types (API row shapes)
// ────────────────────────────────────────────────────────────

interface PatientRow {
  id: string;
  patient_id: string;
  created_at: string;
  grade: string;
  class_level: number;
  confidence: number;
  trust_score: number;
  trust_level: TrustLevel;
  status: CaseStatus;
  dme_risk: boolean;
  quality_score: number;
  processing_ms: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

interface PatientDetail {
  patientId: string;
  status: CaseStatus;
  details: ScreeningResult | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

type FilterKey = "all" | "auto_cleared" | "needs_review" | "urgent" | "rejected";

type SortKey = "patient_id" | "created_at" | "grade" | "confidence" | "trust_score" | "status" | "processing_ms";

// doctor-meaningful lane order: urgent first, auto-cleared last
const STATUS_SORT_ORDER: Record<CaseStatus, number> = {
  URGENT: 0,
  NEEDS_REVIEW: 1,
  REJECTED: 2,
  AUTO_CLEARED: 3,
};

const NUMERIC_SORT_KEYS = new Set<SortKey>(["created_at", "grade", "confidence", "trust_score", "processing_ms"]);

function sortValue(r: PatientRow, key: SortKey): string | number {
  switch (key) {
    case "patient_id":
      return r.patient_id;
    case "created_at":
      return new Date(r.created_at).getTime();
    case "grade":
      return r.class_level;
    case "confidence":
      return r.confidence;
    case "trust_score":
      return r.trust_score;
    case "status":
      return STATUS_SORT_ORDER[r.status] ?? 9;
    case "processing_ms":
      return r.processing_ms;
  }
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "auto_cleared", label: "Auto-cleared (HIGH)" },
  { key: "needs_review", label: "Needs review (MODERATE)" },
  { key: "urgent", label: "Urgent (LOW + DME)" },
  { key: "rejected", label: "Rejected" },
];

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "Vessels", color: "#b3402e" },
  { label: "MA", color: "#e0331f" },
  { label: "HEM", color: "#9b1c1c" },
  { label: "EX", color: "#f2d66c" },
  { label: "DME", color: "#fbbf24" },
  { label: "Grad-CAM", color: "#ffb020" },
];

const TIMING_KEYS = ["gate", "evidence", "classify", "explain", "total"] as const;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function icdrColor(level: number): string | undefined {
  return ICDR_CLASSES.find((c) => c.level === level)?.color;
}

function rowGradeColor(row: PatientRow): string | undefined {
  if (row.status === "REJECTED" || row.class_level < 0) return undefined;
  return icdrColor(row.class_level);
}

// ────────────────────────────────────────────────────────────
// Small building blocks
// ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  sub,
  value,
  decimals = 0,
  suffix = "",
  valueClass,
  iconClass,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  value: number;
  decimals?: number;
  suffix?: string;
  valueClass: string;
  iconClass: string;
  loading: boolean;
}) {
  return (
    <GlassCard className="p-4 sm:p-6">
      {loading ? (
        <div className="flex items-start justify-between gap-3">
          <div className="w-full space-y-2.5">
            <div className="skeleton-shimmer h-9 w-20 rounded-md" />
            <div className="skeleton-shimmer h-3.5 w-24 rounded" />
            <div className="skeleton-shimmer h-2.5 w-28 rounded" />
          </div>
          <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-lg" />
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("tabular font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl", valueClass)}>
              <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>
          </div>
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", iconClass)}>
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
        </div>
      )}
    </GlassCard>
  );
}

function SortHead({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  colKey: SortKey;
  sortKey: SortKey | null;
  sortDir: 1 | -1;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === colKey;
  const Icon = !active ? ChevronsUpDown : sortDir === 1 ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sortDir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(colKey)}
        title={`Sort by ${label.toLowerCase()}`}
        className={cn(
          "inline-flex items-center gap-1 rounded uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-[#22D3EE]" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
        <Icon
          className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-45")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

function EmptyQueue({ onLaunch, searching, query }: { onLaunch: () => void; searching?: boolean; query?: string }) {
  if (searching) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <SearchX className="h-7 w-7 text-[#FBBF24]/70" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          No cases match <span className="font-semibold text-foreground">“{query}”</span> in this queue
        </p>
        <p className="text-xs text-muted-foreground/80">Patient IDs look like SEVERE-001 or RAMPUR-0118</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <ScanLine className="h-8 w-8 text-[#22D3EE]/60" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">No cases in this queue — run a screening first</p>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11 border-[#22D3EE]/40 text-[#22D3EE] hover:bg-[#22D3EE]/10 hover:text-[#22D3EE]"
        onClick={onLaunch}
      >
        <ScanLine className="h-4 w-4" aria-hidden="true" />
        Open live screening
      </Button>
    </div>
  );
}

function QueueError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <TriangleAlert className="h-6 w-6 text-[#F87171]" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Couldn&apos;t load the queue</p>
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button
        size="sm"
        variant="outline"
        className="min-h-11 border-white/15 hover:border-[#F87171]/40 hover:text-[#F87171]"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function LesionStat({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-center">
      <AnimatedNumber value={count} className="font-display text-xl font-bold" />
      <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}

function ModalSkeleton() {
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="skeleton-shimmer aspect-square w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {LEGEND.map((l) => (
            <div key={l.label} className="skeleton-shimmer h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="skeleton-shimmer h-32 w-full rounded-xl" />
        <div className="skeleton-shimmer h-20 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-2">
          <div className="skeleton-shimmer h-20 rounded-lg" />
          <div className="skeleton-shimmer h-20 rounded-lg" />
          <div className="skeleton-shimmer h-20 rounded-lg" />
        </div>
        <div className="skeleton-shimmer h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────

export default function DashboardView() {
  const { navigate } = useNav();

  // full dataset (stats + tab counts)
  const [allRows, setAllRows] = useState<PatientRow[] | null>(null);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);

  // current filter queue
  const [filter, setFilter] = useState<FilterKey>("all");
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // report modal
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailNonce, setDetailNonce] = useState(0);

  // register search + column sort (client-side, applies to the active lane)
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // sign-off audit trail: patientId → who/when (persisted server-side via PATCH)
  const signedOffRef = useRef<Record<string, boolean>>({});
  const [signedOff, setSignedOff] = useState<Record<string, { by: string; at: string; previousStatus: CaseStatus }>>({});
  const [signingOff, setSigningOff] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);
  const quietRefreshRef = useRef(false);

  // bulk sign-off selection (review-queue cases approved in one action)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const applyOverrides = useCallback(
    (list: PatientRow[]): PatientRow[] =>
      list.map((r) => (signedOffRef.current[r.patient_id] ? { ...r, status: "AUTO_CLEARED" as CaseStatus } : r)),
    []
  );

  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setAllLoading(true);
      setAllError(null);
      try {
        const res = await fetch("/api/patients");
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = (await res.json()) as { patients: PatientRow[] };
        setAllRows(applyOverrides(data.patients ?? []));
      } catch (e) {
        quietRefreshRef.current = false;
        setAllError(e instanceof Error ? e.message : "Failed to load cases");
      } finally {
        setAllLoading(false);
      }
    },
    [applyOverrides]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // queue rows follow the active filter; "all" reuses the already-loaded list
  useEffect(() => {
    if (filter === "all" && allRows) {
      setRows(allRows);
      setRowsLoading(false);
      setRowsError(null);
      return;
    }
    const quiet = quietRefreshRef.current;
    quietRefreshRef.current = false;
    let cancelled = false;
    if (!quiet) setRowsLoading(true);
    setRowsError(null);
    fetch(`/api/patients?filter=${filter}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return (await res.json()) as { patients: PatientRow[] };
      })
      .then((d) => {
        if (!cancelled) setRows(applyOverrides(d.patients ?? []));
      })
      .catch((e) => {
        if (!cancelled) setRowsError(e instanceof Error ? e.message : "Failed to load queue");
      })
      .finally(() => {
        if (!cancelled && !quiet) setRowsLoading(false);
        if (quiet) setRowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, allRows, applyOverrides]);

  // report detail fetch on modal open / retry
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/patients/${encodeURIComponent(openId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return (await res.json()) as PatientDetail;
      })
      .then((d) => {
        if (cancelled) return;
        if (signedOffRef.current[openId] && d.details) {
          setDetail({ ...d, status: "AUTO_CLEARED", details: { ...d.details, status: "AUTO_CLEARED" } });
        } else {
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, detailNonce]);

  const stats = useMemo(() => {
    const list = allRows ?? [];
    const today = new Date().toDateString();
    const screenedToday = list.filter((r) => new Date(r.created_at).toDateString() === today).length;
    const referable = list.filter((r) => r.class_level >= 2 && r.status !== "REJECTED").length;
    const urgentCount = list.filter((r) => r.status === "URGENT").length;
    const queue = list.filter((r) => r.status === "NEEDS_REVIEW" || r.status === "URGENT").length;
    const signedCount = list.filter((r) => r.reviewed_by).length;
    const signedToday = list.filter((r) => r.reviewed_at && new Date(r.reviewed_at).toDateString() === today).length;
    const avgMs = list.length ? list.reduce((a, r) => a + r.processing_ms, 0) / list.length : 0;
    return { screenedToday, referable, urgentCount, queue, signedCount, signedToday, avgSec: avgMs / 1000 };
  }, [allRows]);

  const counts = useMemo(() => {
    const list = allRows ?? [];
    const c: Record<FilterKey, number> = { all: list.length, auto_cleared: 0, needs_review: 0, urgent: 0, rejected: 0 };
    for (const r of list) {
      if (r.status === "AUTO_CLEARED") c.auto_cleared++;
      else if (r.status === "NEEDS_REVIEW") c.needs_review++;
      else if (r.status === "URGENT") c.urgent++;
      else if (r.status === "REJECTED") c.rejected++;
    }
    return c;
  }, [allRows]);

  // how many auto-cleared cases carry a doctor sign-off (chip badge)
  const signedAuto = useMemo(
    () => (allRows ?? []).filter((r) => r.status === "AUTO_CLEARED" && r.reviewed_by).length,
    [allRows]
  );

  // search + sort pipeline over the active lane's rows
  const visibleRows = useMemo(() => {
    let list = rows ?? [];
    const q = query.trim().toUpperCase();
    if (q) list = list.filter((r) => r.patient_id.toUpperCase().includes(q));
    if (sortKey) {
      const dir = sortDir;
      list = [...list].sort((a, b) => {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        if (typeof va === "string" || typeof vb === "string") {
          return dir === 1
            ? String(va).localeCompare(String(vb))
            : String(vb).localeCompare(String(va));
        }
        return dir === 1 ? va - vb : vb - va;
      });
    }
    return list;
  }, [rows, query, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 1 ? -1 : 1));
      } else {
        setSortKey(key);
        setSortDir(NUMERIC_SORT_KEYS.has(key) ? -1 : 1);
      }
    },
    [sortKey]
  );

  // ── Bulk sign-off selection ─────────────────────────────────
  // Only review-queue cases (MODERATE / URGENT, not yet signed) can be picked.
  const isSignable = useCallback(
    (r: PatientRow) => (r.status === "NEEDS_REVIEW" || r.status === "URGENT") && !r.reviewed_by,
    []
  );
  // keep only IDs that are still live, signable rows (prunes stale picks after refreshes)
  const selectedIds = useMemo(
    () =>
      [...selected].filter((id) =>
        (allRows ?? []).some((r) => r.patient_id === id && isSignable(r))
      ),
    [selected, allRows, isSignable]
  );
  const visibleSignableIds = useMemo(
    () => visibleRows.filter((r) => isSignable(r)).map((r) => r.patient_id),
    [visibleRows, isSignable]
  );
  const allVisibleSelected =
    visibleSignableIds.length > 0 && visibleSignableIds.every((id) => selected.has(id));

  const toggleSelect = useCallback((patientId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSel = visibleSignableIds.length > 0 && visibleSignableIds.every((id) => next.has(id));
      if (allSel) visibleSignableIds.forEach((id) => next.delete(id));
      else visibleSignableIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleSignableIds]);

  const openReport = useCallback((patientId: string) => {
    setOpenId(patientId);
    setDetailNonce((n) => n + 1);
  }, []);

  async function handleSignOff(patientId: string) {
    if (signingOff) return;
    setSigningOff(patientId);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "AUTO_CLEARED", reviewed_by: "Dr. Review (dashboard demo)" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      const data = (await res.json()) as { reviewed_by: string; reviewed_at: string };
      const at = data.reviewed_at ? new Date(data.reviewed_at).toLocaleString() : new Date().toLocaleString();
      toast.success(`Signed off by ${data.reviewed_by} — saved to the register`);
      signedOffRef.current = { ...signedOffRef.current, [patientId]: true };
      // remember the pre-sign-off status so Undo can restore the right queue lane
      const prevRow = allRows?.find((r) => r.patient_id === patientId) ?? rows?.find((r) => r.patient_id === patientId);
      const previousStatus: CaseStatus =
        prevRow && (prevRow.status === "NEEDS_REVIEW" || prevRow.status === "URGENT")
          ? prevRow.status
          : detailResult && (detailResult.status === "NEEDS_REVIEW" || detailResult.status === "URGENT")
            ? detailResult.status
            : "NEEDS_REVIEW";
      setSignedOff((s) => ({ ...s, [patientId]: { by: data.reviewed_by, at, previousStatus } }));
      const flip = (r: PatientRow): PatientRow =>
        r.patient_id === patientId
          ? { ...r, status: "AUTO_CLEARED", reviewed_by: data.reviewed_by, reviewed_at: data.reviewed_at }
          : r;
      setAllRows((prev) => (prev ? applyOverrides(prev.map(flip)) : prev));
      setRows((prev) => (prev ? applyOverrides(prev.map(flip)) : prev));
      setDetail((prev) =>
        prev && prev.details
          ? { ...prev, status: "AUTO_CLEARED", details: { ...prev.details, status: "AUTO_CLEARED" } }
          : prev
      );
      // quiet refresh of stats + counts (list already flipped optimistically)
      quietRefreshRef.current = true;
      void loadAll(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-off failed — try again");
    } finally {
      setSigningOff(null);
    }
  }

  async function handleReopen(patientId: string) {
    if (signingOff) return;
    const record = signedOff[patientId];
    // post-reload undo can't know the original lane — infer from routing rules
    // (URGENT = LOW-trust or DME-risk cases jump the queue; everything else is MODERATE review)
    const previousStatus: CaseStatus =
      record?.previousStatus ??
      (detailResult && (detailResult.trust.trust_level === "LOW" || detailResult.evidence.dme_risk) ? "URGENT" : "NEEDS_REVIEW");
    setSigningOff(patientId);
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: previousStatus,
          reviewed_by: "Dr. Review (dashboard demo)",
          note: `Sign-off reopened by Dr. Review — case returned to the ${previousStatus === "URGENT" ? "urgent" : "review"} queue`,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      toast.success(`Case reopened — returned to the ${previousStatus === "URGENT" ? "urgent" : "review"} queue`);
      signedOffRef.current = Object.fromEntries(
        Object.entries(signedOffRef.current).filter(([k]) => k !== patientId)
      );
      setSignedOff((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== patientId)));
      const flip = (r: PatientRow): PatientRow =>
        r.patient_id === patientId
          ? { ...r, status: previousStatus, reviewed_by: null, reviewed_at: null }
          : r;
      setAllRows((prev) => (prev ? prev.map(flip) : prev));
      setRows((prev) => (prev ? prev.map(flip) : prev));
      setDetail((prev) =>
        prev && prev.details
          ? { ...prev, status: previousStatus, details: { ...prev.details, status: previousStatus } }
          : prev
      );
      // quiet refresh of stats + counts (list already flipped optimistically)
      quietRefreshRef.current = true;
      void loadAll(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reopen failed — try again");
    } finally {
      setSigningOff(null);
      setReopenTarget(null);
    }
  }

  async function handleBulkSignOff() {
    if (bulkBusy || selectedIds.length === 0) return;
    setBulkBusy(true);
    const ids = selectedIds;
    try {
      const res = await fetch("/api/patients/bulk-signoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_ids: ids, reviewed_by: "Dr. Review (dashboard demo)" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      const data = (await res.json()) as {
        signed: string[];
        signed_count: number;
        failed: Array<{ patient_id: string; error: string }>;
        reviewed_by: string;
        reviewed_at: string | null;
      };
      const signedSet = new Set(data.signed);
      if (data.signed.length > 0) {
        const stamp = data.reviewed_at ?? new Date().toISOString();
        const nextRef = { ...signedOffRef.current };
        data.signed.forEach((id) => {
          nextRef[id] = true;
        });
        signedOffRef.current = nextRef;
        // record pre-sign-off lane per case so Undo restores the exact queue
        const prevMap = new Map((allRows ?? []).map((r) => [r.patient_id, r.status as CaseStatus]));
        setSignedOff((s) => {
          const next = { ...s };
          data.signed.forEach((id) => {
            const prev = prevMap.get(id);
            next[id] = {
              by: data.reviewed_by,
              at: new Date(stamp).toLocaleString(),
              previousStatus: prev === "URGENT" ? "URGENT" : "NEEDS_REVIEW",
            };
          });
          return next;
        });
        const flip = (r: PatientRow): PatientRow =>
          signedSet.has(r.patient_id)
            ? { ...r, status: "AUTO_CLEARED", reviewed_by: data.reviewed_by, reviewed_at: stamp }
            : r;
        setAllRows((prev) => (prev ? applyOverrides(prev.map(flip)) : prev));
        setRows((prev) => (prev ? applyOverrides(prev.map(flip)) : prev));
        toast.success(
          `${data.signed_count} case${data.signed_count === 1 ? "" : "s"} signed off — saved to the register`
        );
      }
      if (data.failed.length > 0) {
        const first = data.failed[0];
        toast.error(
          `${data.failed.length} case${data.failed.length === 1 ? "" : "s"} couldn't be signed — ${first.patient_id}: ${first.error}`
        );
      }
      setSelected(new Set());
      quietRefreshRef.current = true;
      void loadAll(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk sign-off failed — try again");
    } finally {
      setBulkBusy(false);
      setBulkConfirmOpen(false);
    }
  }

  function handleRegisterPdf() {
    const signedRows = (allRows ?? []).filter((r) => r.reviewed_by);
    if (signedRows.length === 0) {
      toast.info("No signed-off cases yet — approve a case first to build the register");
      return;
    }
    downloadRegisterPdf(signedRows as RegisterRow[]);
    toast.success(`Register PDF generated — ${signedRows.length} signed case${signedRows.length === 1 ? "" : "s"}`);
  }

  const detailResult = detail?.details ?? null;
  const isRejected = detailResult ? detailResult.status === "REJECTED" || detailResult.gate.accepted === false : false;
  const canSign =
    !!detailResult && (detailResult.status === "NEEDS_REVIEW" || detailResult.status === "URGENT") && !signedOff[openId ?? ""];
  const isSignedOffHere = Boolean(signedOff[openId ?? ""] || detail?.reviewed_by);
  const reviewedAtText = (() => {
    const iso = detail?.reviewed_at ?? null;
    if (!iso) return signedOff[openId ?? ""]?.at ?? "";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "";
    }
  })();
  const reviewNoteText = detail?.reviewed_by
    ? `Audit trail: signed off by ${detail.reviewed_by}${reviewedAtText ? ` at ${reviewedAtText}` : ""} — persisted in the screening register`
    : "Audit trail: signed off — persisted in the screening register";

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionHeading
        eyebrow="HUMAN-IN-THE-LOOP"
        title={
          <>
            Doctor Dashboard — <span className="text-glow-cyan">Review Queue</span>
          </>
        }
        sub="HIGH-trust cases auto-clear. MODERATE cases wait for your sign-off. Urgent and DME cases jump the queue."
      />
      <Reveal className="-mt-4 mb-10 flex justify-center">
        <span className="chip border-[#FBBF24]/40 bg-[#2A2210]/60 text-[#FBBF24]">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          Demo data — simulated screening records
        </span>
      </Reveal>

      {/* 1 ── Stats cards */}
      <Reveal delay={0.05}>
        {allError ? (
          <GlassCard className="border-[#F87171]/30 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-[#F87171]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Couldn&apos;t load dashboard stats</p>
                  <p className="text-xs text-muted-foreground">{allError}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0 border-[#F87171]/40 text-[#F87171] hover:bg-[#F87171]/10 hover:text-[#F87171]"
                onClick={() => void loadAll()}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              icon={ScanEye}
              label="Screened today"
              sub="cases through the DRISHTI pipeline today"
              value={stats.screenedToday}
              valueClass="text-[#22D3EE]"
              iconClass="border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]"
              loading={allLoading}
            />
            <StatCard
              icon={Crosshair}
              label="Referable caught"
              sub="grade ≥ Moderate NPDR · refer within 3-6 months"
              value={stats.referable}
              valueClass="text-[#FBBF24]"
              iconClass="border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]"
              loading={allLoading}
            />
            <StatCard
              icon={ClipboardList}
              label="Review queue"
              sub="MODERATE + URGENT awaiting doctor sign-off"
              value={stats.queue}
              valueClass={stats.urgentCount > 0 ? "text-[#F87171]" : "text-[#FBBF24]"}
              iconClass={
                stats.urgentCount > 0
                  ? "border-[#F87171]/30 bg-[#F87171]/10 text-[#F87171]"
                  : "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]"
              }
              loading={allLoading}
            />
            <StatCard
              icon={ShieldCheck}
              label="Signed off"
              sub={
                stats.signedToday > 0
                  ? `${stats.signedToday} approved today · closed in the register`
                  : "cases approved by the reviewing doctor"
              }
              value={stats.signedCount}
              valueClass="text-[#34D399]"
              iconClass="border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
              loading={allLoading}
            />
            <StatCard
              icon={Timer}
              label="Avg processing time"
              sub="gate → evidence → CNN → Grad-CAM → trust"
              value={stats.avgSec}
              decimals={1}
              suffix="s"
              valueClass="text-[#22D3EE]"
              iconClass="border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]"
              loading={allLoading}
            />
          </div>
        )}
      </Reveal>

      {/* 2 ── Filter tabs + search + register export */}
      <Reveal delay={0.1} className="mt-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="drishti-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Queue filters">
          {FILTER_TABS.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all duration-200 sm:text-sm",
                  active
                    ? "border-[#22D3EE]/40 bg-[#22D3EE]/15 text-[#22D3EE]"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-[#22D3EE]/20 text-[#22D3EE]" : "bg-white/5 text-muted-foreground"
                  )}
                >
                  {allRows ? counts[t.key] : "·"}
                </span>
                {t.key === "auto_cleared" && allRows && signedAuto > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full border border-[#34D399]/40 bg-[#0A2E24]/70 px-1.5 py-0.5 text-[10px] font-semibold text-[#34D399]"
                    title={`${signedAuto} of these were signed off by the doctor`}
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {signedAuto}
                  </span>
                )}
              </button>
            );
          })}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-60">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient ID…"
                aria-label="Search cases by patient ID"
                className="h-11 rounded-lg border-white/15 bg-white/[0.03] pl-9 pr-9 text-sm placeholder:text-muted-foreground/70 focus-visible:border-[#22D3EE]/50 focus-visible:ring-[#22D3EE]/25"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleRegisterPdf}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-[#34D399]/40 hover:text-[#34D399] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Download a PDF register of every doctor-signed case"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Register PDF
            </button>
            <a
              href={`/api/patients/export?filter=${filter}`}
              download
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
              title="Download the current queue as a CSV register"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </a>
          </div>
        </div>
        {query.trim() !== "" && rows && !rowsLoading && !rowsError && (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            Showing <span className="tabular font-semibold text-[#22D3EE]">{visibleRows.length}</span> of{" "}
            <span className="tabular">{rows.length}</span> cases in this lane matching “{query.trim()}”
          </p>
        )}
      </Reveal>

      {/* 3 ── Patient table (desktop) */}
      <Reveal delay={0.15} className="mt-4 hidden md:block">
        <GlassCard className="p-0">
          {rowsError ? (
            <QueueError message={rowsError} onRetry={() => void loadAll()} />
          ) : rowsLoading || !rows ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <EmptyQueue onLaunch={() => navigate("screening")} searching={query.trim() !== ""} query={query.trim()} />
          ) : (
            <div className="drishti-scroll max-h-[480px] overflow-y-auto">
              <Table className="min-w-[760px]">
                <TableHeader className="sticky top-0 z-10 bg-[#0A1628]/95 backdrop-blur">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-10 pr-2">
                      <Checkbox
                        checked={allVisibleSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAllVisible}
                        disabled={visibleSignableIds.length === 0}
                        aria-label="Select all signable cases in this lane for bulk sign-off"
                        title="Select every review-queue case in this lane"
                        className="h-4 w-4 border-white/30 bg-white/[0.04] data-[state=checked]:border-[#34D399] data-[state=checked]:bg-[#34D399] data-[state=checked]:text-[#05261B]"
                      />
                    </TableHead>
                    <SortHead label="Patient ID" colKey="patient_id" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <SortHead label="Date" colKey="created_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <SortHead label="Grade" colKey="grade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <SortHead label="Conf" colKey="confidence" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <SortHead label="Trust" colKey="trust_score" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <SortHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-xs" />
                    <TableHead className="hidden text-xs uppercase tracking-wider lg:table-cell">DME</TableHead>
                    <SortHead label="Time" colKey="processing_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => {
                    const gColor = rowGradeColor(r);
                    const selectable = isSignable(r);
                    const isSelected = selected.has(r.patient_id);
                    return (
                      <TableRow
                        key={r.id}
                        tabIndex={0}
                        aria-label={`Open report for ${r.patient_id}`}
                        onClick={() => openReport(r.patient_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openReport(r.patient_id);
                          }
                        }}
                        style={
                          isSelected
                            ? { boxShadow: "inset 3px 0 0 0 rgba(52,211,153,0.95), inset 0 0 0 1px rgba(52,211,153,0.22)" }
                            : r.reviewed_by
                              ? { boxShadow: "inset 2px 0 0 0 rgba(52,211,153,0.55)" }
                              : undefined
                        }
                        className={cn(
                          "cursor-pointer border-white/5 focus-visible:bg-white/[0.05] focus-visible:outline-none",
                          isSelected
                            ? "bg-[#34D399]/[0.06] hover:bg-[#34D399]/[0.09]"
                            : "hover:bg-white/[0.03]"
                        )}
                      >
                        <TableCell className="w-10 py-3 pr-2" onClick={(e) => e.stopPropagation()}>
                          {selectable ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(r.patient_id)}
                              aria-label={`Select ${r.patient_id} for sign-off`}
                              className="h-4 w-4 border-white/30 bg-white/[0.04] data-[state=checked]:border-[#34D399] data-[state=checked]:bg-[#34D399] data-[state=checked]:text-[#05261B]"
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="font-display font-semibold text-foreground">{r.patient_id}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="tabular text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span
                            className={cn("text-sm font-medium", !gColor && "text-muted-foreground")}
                            style={gColor ? { color: gColor } : undefined}
                          >
                            {r.grade || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="tabular text-sm text-foreground/90">{(r.confidence * 100).toFixed(1)}%</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <TrustChip level={r.trust_level} />
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="flex items-center gap-1.5">
                            <StatusChip status={r.status} />
                            {r.reviewed_by && (
                              <span
                                className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-[#34D399]/50 bg-[#0A2E24] text-[#34D399]"
                                title={`Signed off by ${r.reviewed_by}${r.reviewed_at ? ` · ${fmtDate(r.reviewed_at)}` : ""}`}
                                aria-label={`Signed off by ${r.reviewed_by}`}
                              >
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="hidden py-3 lg:table-cell">
                          {r.dme_risk ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F87171]">
                              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              DME
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <span className="tabular text-xs text-muted-foreground">{(r.processing_ms / 1000).toFixed(1)}s</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>
      </Reveal>

      {/* 3b ── Mobile cards */}
      <div className="mt-4 grid gap-3 md:hidden">
        {rowsError ? (
          <GlassCard className="p-0">
            <QueueError message={rowsError} onRetry={() => void loadAll()} />
          </GlassCard>
        ) : rowsLoading || !rows ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-shimmer h-28 w-full rounded-xl" />)
        ) : visibleRows.length === 0 ? (
          <GlassCard className="p-0">
            <EmptyQueue onLaunch={() => navigate("screening")} searching={query.trim() !== ""} query={query.trim()} />
          </GlassCard>
        ) : (
          visibleRows.map((r) => {
            const gColor = rowGradeColor(r);
            const selectable = isSignable(r);
            const isSelected = selected.has(r.patient_id);
            return (
              <GlassCard
                key={r.id}
                className={cn(
                  "p-3",
                  !selectable && "glass-card-hover cursor-pointer"
                )}
                {...(!selectable ? { hover: true } : {})}
              >
                <div className="flex items-start gap-2.5">
                  {selectable ? (
                    <div className="flex h-6 items-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(r.patient_id)}
                        aria-label={`Select ${r.patient_id} for sign-off`}
                        className="h-4 w-4 border-white/30 bg-white/[0.04] data-[state=checked]:border-[#34D399] data-[state=checked]:bg-[#34D399] data-[state=checked]:text-[#05261B]"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "w-full min-w-0 text-left",
                      selectable && "glass-card-hover cursor-pointer rounded-lg"
                    )}
                    aria-label={`Open report for ${r.patient_id}`}
                    onClick={() => openReport(r.patient_id)}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-foreground">{r.patient_id}</p>
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">{fmtDate(r.created_at)}</p>
                    </div>
                    <TrustChip level={r.trust_level} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "chip",
                        !gColor && "border-white/25 text-muted-foreground"
                      )}
                      style={gColor ? { borderColor: `${gColor}55`, color: gColor } : undefined}
                    >
                      {gColor && <span className="h-1.5 w-1.5 rounded-full" style={{ background: gColor }} aria-hidden="true" />}
                      {r.grade || "—"}
                    </span>
                    <StatusChip status={r.status} />
                    {r.reviewed_by && (
                      <span
                        className="chip border-[#34D399]/45 bg-[#0A2E24]/70 text-[#34D399]"
                        title={`Signed off by ${r.reviewed_by}${r.reviewed_at ? ` · ${fmtDate(r.reviewed_at)}` : ""}`}
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        Signed
                      </span>
                    )}
                    {r.dme_risk && (
                      <span className="chip border-[#F87171]/40 text-[#F87171]">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                        DME
                      </span>
                    )}
                  </div>
                  <div className="tabular mt-2.5 flex gap-4 text-xs text-muted-foreground">
                    <span>Conf {(r.confidence * 100).toFixed(1)}%</span>
                    <span>{(r.processing_ms / 1000).toFixed(1)}s</span>
                  </div>
                  </button>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>

      {/* 3c ── Bulk selection action bar */}
      {selectedIds.length > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 sm:bottom-8"
          role="region"
          aria-label="Bulk sign-off actions"
        >
          <div className="rise-in pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[#34D399]/35 bg-[#0B1526]/95 p-3 shadow-[0_10px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:w-auto">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]">
              <ListChecks className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="tabular text-sm font-semibold leading-tight text-foreground">
                {selectedIds.length} case{selectedIds.length === 1 ? "" : "s"} selected
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                ready for bulk sign-off · approvals close in the register
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                className="min-h-10 bg-[#34D399] font-semibold text-[#05261B] hover:bg-[#2BC48B]"
                onClick={() => setBulkConfirmOpen(true)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Sign off all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-10 px-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
                title="Clear selection"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 4 ── Report modal */}
      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-h-[85vh] max-w-4xl gap-0 overflow-y-auto overflow-x-hidden border-[#22D3EE]/25 bg-[#0B1526]/95 p-0 backdrop-blur-xl sm:max-w-4xl drishti-scroll"
          )}
        >
          {detailLoading && <ModalSkeleton />}

          {!detailLoading && detailError && (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <TriangleAlert className="h-6 w-6 text-[#F87171]" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Couldn&apos;t load the report</p>
              <p className="text-xs text-muted-foreground">{detailError}</p>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 border-white/15 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
                onClick={() => setDetailNonce((n) => n + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          )}

          {!detailLoading && !detailError && detailResult && openId && (
            <>
              <div className="px-6 pt-6">
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-xl">
                    <span>{detailResult.patient_id}</span>
                    {(() => {
                      const gc =
                        detailResult.status === "REJECTED" || detailResult.classification.class_level < 0
                          ? undefined
                          : icdrColor(detailResult.classification.class_level);
                      return (
                        <span
                          className={cn("text-sm font-semibold", !gc && "text-muted-foreground")}
                          style={gc ? { color: gc } : undefined}
                        >
                          {detailResult.classification.predicted_class || "—"}
                        </span>
                      );
                    })()}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="tabular">Screened {fmtDate(detailResult.created_at)}</span>
                    <span aria-hidden="true">·</span>
                    <StatusChip status={detailResult.status} />
                    <TrustChip level={detailResult.trust.trust_level} />
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-2">
                {/* LEFT — retina + evidence overlay */}
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-[#22D3EE]/20">
                    <RetinaView
                      severity={
                        isRejected ? 0 : Math.max(0, Math.min(4, detailResult.classification.class_level))
                      }
                      dmeRisk={detailResult.evidence.dme_risk}
                      lesions={detailResult.evidence.lesions}
                      gradcam={detailResult.evidence.gradcam}
                      layers={{ vessels: true, ma: true, hem: true, ex: true, dme: true, gradcam: true }}
                      rejected={isRejected}
                      className="aspect-square w-full"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" aria-label="Evidence overlay legend">
                    {LEGEND.map((l) => (
                      <span
                        key={l.label}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                        {l.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Grad-CAM highlights the regions that drove the CNN decision — the model attends to lesions, not
                    artifacts.
                  </p>
                </div>

                {/* RIGHT — trust breakdown */}
                <div className="space-y-5">
                  <div className="flex items-center gap-5">
                    <ScoreDial
                      value={detailResult.trust.trust_score}
                      size={128}
                      label="Trust"
                      sublabel={detailResult.trust.trust_level}
                    />
                    <div className="min-w-0 space-y-2">
                      <TrustChip level={detailResult.trust.trust_level} />
                      <p className="text-sm leading-snug text-muted-foreground">{detailResult.trust.route}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-around rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <ScoreDial value={detailResult.gate.quality_score} size={90} label="Quality" />
                    <ScoreDial value={detailResult.explainability.consistency} size={90} label="Consistency" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <LesionStat count={detailResult.evidence.ma_count} label="MA" color="#e0331f" />
                    <LesionStat count={detailResult.evidence.hem_count} label="HEM" color="#9b1c1c" />
                    <LesionStat count={detailResult.evidence.ex_count} label="EX" color="#f2d66c" />
                  </div>

                  {!isRejected ? (
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Class probabilities — top 3
                      </p>
                      {Object.entries(detailResult.classification.probabilities)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([label, value], i) => (
                          <ConfBar
                            key={label}
                            label={label}
                            value={value}
                            color={icdrColor(ICDR_CLASSES.find((c) => c.short === label)?.level ?? -1) ?? "#22D3EE"}
                            active={label === detailResult.classification.predicted_class}
                            delay={i * 90}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg border border-[#F87171]/40 bg-[#2E0F12]/70 p-3">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F87171]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[#F87171]">Image failed the quality gate</p>
                        <p className="text-xs text-[#F8A5A5]/80">{detailResult.gate.message}</p>
                      </div>
                    </div>
                  )}

                  {detailResult.evidence.dme_risk && !isRejected && (
                    <div className="flex items-start gap-2 rounded-lg border border-[#F87171]/40 bg-[#2E0F12]/70 p-3">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F87171]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[#F87171]">DME risk flagged</p>
                        <p className="text-xs text-[#F8A5A5]/80">{detailResult.evidence.dme_message}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {TIMING_KEYS.map((k) => (
                      <span
                        key={k}
                        className="chip border-white/10 bg-white/[0.03] text-muted-foreground"
                      >
                        {k}
                        <span className="tabular">{detailResult.timings_ms[k]}ms</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col gap-3 border-t border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  Demo data — simulated case
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="min-h-11 border-white/15 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
                    onClick={() => downloadReportPdf(detailResult)}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download PDF
                  </Button>
                  {isSignedOffHere && openId ? (
                    <span className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span
                        className="chip min-h-11 border-[#34D399]/40 bg-[#0A2E24]/60 text-[#34D399]"
                        title={reviewNoteText}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Signed off · {(signedOff[openId]?.by ?? detail?.reviewed_by ?? "").split(" (")[0]}
                        {reviewedAtText ? ` · ${reviewedAtText}` : ""}
                      </span>
                      <Button
                        variant="outline"
                        className="min-h-11 border-white/15 px-3 text-xs text-muted-foreground hover:border-[#FBBF24]/50 hover:text-[#FBBF24]"
                        title="Clear the sign-off and return this case to the review queue"
                        onClick={() => setReopenTarget(openId)}
                        disabled={signingOff === openId}
                      >
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                        {signingOff === openId ? "Reopening…" : "Undo"}
                      </Button>
                    </span>
                  ) : canSign && openId ? (
                    <Button
                      className="min-h-11 bg-[#34D399] font-semibold text-[#05261B] hover:bg-[#2BC48B] disabled:opacity-60"
                      onClick={() => void handleSignOff(openId)}
                      disabled={signingOff === openId}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {signingOff === openId ? "Signing off…" : "Approve & sign-off"}
                    </Button>
                  ) : null}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 5 ── Reopen (undo sign-off) confirmation */}
      <AlertDialog open={reopenTarget !== null} onOpenChange={(o) => { if (!o) setReopenTarget(null); }}>
        <AlertDialogContent className="border-[#FBBF24]/30 bg-[#0B1526]/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg">Reopen {reopenTarget ?? "this case"} for review?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              The sign-off will be cleared and the case returns to the{" "}
              <span className="font-semibold text-[#FBBF24]">
                {reopenTarget && signedOff[reopenTarget]?.previousStatus === "URGENT" ? "urgent" : "review"} queue
              </span>
              . The audit trail records the reopen — re-approve when you&apos;re ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 border-white/15 bg-transparent hover:bg-white/5 hover:text-foreground">
              Keep sign-off
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-[#FBBF24] font-semibold text-[#2A2210] hover:bg-[#EAB308]"
              onClick={(e) => {
                e.preventDefault();
                if (reopenTarget) void handleReopen(reopenTarget);
              }}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Reopen case
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 6 ── Bulk sign-off confirmation */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent className="border-[#34D399]/30 bg-[#0B1526]/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg">
              Sign off {selectedIds.length} case{selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Each selected case becomes{" "}
              <span className="font-semibold text-[#34D399]">auto-cleared with your sign-off</span> recorded in the
              audit trail. Cases:{" "}
              <span className="tabular text-foreground">
                {selectedIds.slice(0, 4).join(", ")}
                {selectedIds.length > 4 ? ` + ${selectedIds.length - 4} more` : ""}
              </span>
              . Each sign-off can be undone later from its report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-11 border-white/15 bg-transparent hover:bg-white/5 hover:text-foreground"
              disabled={bulkBusy}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-[#34D399] font-semibold text-[#05261B] hover:bg-[#2BC48B]"
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkSignOff();
              }}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {bulkBusy ? "Signing off…" : `Approve & sign off ${selectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
