"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  ChevronsUpDown,
  ClipboardList,
  Crosshair,
  Download,
  FileDown,
  FilePenLine,
  FileText,
  History,
  Info,
  ListChecks,
  Printer,
  RefreshCw,
  ScanEye,
  ScanLine,
  Search,
  SearchX,
  ShieldCheck,
  Stethoscope,
  Timer,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ICDR_CLASSES, type CaseAuditEvent, type CaseStatus, type ScreeningResult, type TrustLevel } from "@/lib/drishti";
import { useLang } from "@/lib/i18n";
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

/** One entry of the register audit trail (GET /api/patients/audit). */
interface AuditEvent {
  patient_id: string;
  action: "SIGNED" | "REOPENED" | "ROUTED";
  by: string;
  note: string;
  at: string;
  status: string;
  trust_level: TrustLevel | string;
  grade: string;
}

type FilterKey = "all" | "auto_cleared" | "needs_review" | "urgent" | "rejected";

type AuditActionFilter = "ALL" | "SIGNED" | "REOPENED" | "ROUTED";

// ── reviewing doctor identity (sign-off picker) ─────────────
const DOCTOR_ROSTER = ["Dr. Ananya Rao", "Dr. Vikram Mehta", "Dr. Priya Nair", "Dr. S. Krishnan"];
const DOCTOR_STORAGE_KEY = "drishti-doctor";
const DEMO_SIGNER_SUFFIX = " (dashboard demo)";

/** Local-calendar YYYY-MM-DD key for a screening timestamp — camp days are
 *  calendar days at the camp's timezone, never UTC slices. */
function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

const LEGEND: Array<{ label: string; color: string; i18nKey?: string }> = [
  { label: "Vessels", color: "#b3402e", i18nKey: "leg.vessels" },
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

/** Append a decision to the per-case audit trail (optimistic UI mirror of the
 *  server's withAuditEvent — keeps the modal history live without a refetch). */
function appendAuditEvent(log: CaseAuditEvent[] | undefined, event: CaseAuditEvent): CaseAuditEvent[] {
  return [...(log ?? []), event].slice(-20);
}

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
  index = 0,
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
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06 * index, ease: "easeOut" }}
      className="h-full"
    >
    <GlassCard className="glass-card-hover group h-full p-4 hover:-translate-y-0.5 sm:p-6">
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
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110", iconClass)}>
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
        </div>
      )}
    </GlassCard>
    </motion.div>
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
  const { t } = useLang();

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

  // camp-day register filter (scopes the register below the lane tabs)
  const [dayKey, setDayKey] = useState<string>("all");

  // reviewing doctor identity — recorded as the signer on every sign-off
  const [doctor, setDoctor] = useState(DOCTOR_ROSTER[0]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (saved && DOCTOR_ROSTER.includes(saved)) setDoctor(saved);
    } catch {
      /* private mode — in-memory only */
    }
  }, []);

  // activity feed type filter (register audit trail)
  const [auditFilter, setAuditFilter] = useState<AuditActionFilter>("ALL");

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
  const [bulkNote, setBulkNote] = useState("");

  // single-case sign-off note (report modal — parity with the bulk note)
  const [signOffNote, setSignOffNote] = useState("");

  // register audit trail (activity timeline under the queue)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

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

  const loadAudit = useCallback(async (silent = false) => {
    if (!silent) setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch("/api/patients/audit?limit=40");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = (await res.json()) as { count: number; events: AuditEvent[] };
      setAuditEvents(data.events ?? []);
      setAuditTotal(data.count ?? 0);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

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

  // distinct camp days in the register (chronological; Day 1 = earliest)
  // with a per-day mini-summary: signed count + referable count (grade ≥ Moderate NPDR)
  const campDays = useMemo(() => {
    const acc = new Map<string, { count: number; signed: number; referable: number; unsignedReferable: number }>();
    for (const r of allRows ?? []) {
      const key = dayKeyOf(r.created_at);
      if (!key) continue;
      const s = acc.get(key) ?? { count: 0, signed: 0, referable: 0, unsignedReferable: 0 };
      s.count += 1;
      if (r.reviewed_by) s.signed += 1;
      if (r.class_level >= 2) {
        s.referable += 1;
        if (!r.reviewed_by) s.unsignedReferable += 1;
      }
      acc.set(key, s);
    }
    return [...acc.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, s], i) => ({ key, day: i + 1, ...s }));
  }, [allRows]);

  // "All days" chip shares the same mini-summary numbers across the register
  const allDaysSummary = useMemo(() => {
    const rows = allRows ?? [];
    return {
      count: rows.length,
      signed: rows.filter((r) => r.reviewed_by).length,
      referable: rows.filter((r) => r.class_level >= 2).length,
      unsignedReferable: rows.filter((r) => r.class_level >= 2 && !r.reviewed_by).length,
    };
  }, [allRows]);

  // per-type counts + filtered feed for the activity timeline chips
  const auditCounts = useMemo(() => {
    const c: Record<AuditActionFilter, number> = { ALL: auditEvents?.length ?? 0, SIGNED: 0, REOPENED: 0, ROUTED: 0 };
    for (const ev of auditEvents ?? []) {
      if (ev.action === "SIGNED") c.SIGNED++;
      else if (ev.action === "REOPENED") c.REOPENED++;
      else if (ev.action === "ROUTED") c.ROUTED++;
    }
    return c;
  }, [auditEvents]);

  const filteredAudit = useMemo(
    () => (auditEvents ?? []).filter((ev) => auditFilter === "ALL" || ev.action === auditFilter),
    [auditEvents, auditFilter]
  );

  // search + sort pipeline over the active lane's rows
  const visibleRows = useMemo(() => {
    let list = rows ?? [];
    if (dayKey !== "all") list = list.filter((r) => dayKeyOf(r.created_at) === dayKey);
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
  }, [rows, query, sortKey, sortDir, dayKey]);

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
    setSignOffNote("");
  }, []);

  async function handleSignOff(patientId: string) {
    if (signingOff) return;
    setSigningOff(patientId);
    const note = signOffNote.trim() ? signOffNote.trim().slice(0, 400) : null;
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "AUTO_CLEARED",
          reviewed_by: `${doctor}${DEMO_SIGNER_SUFFIX}`,
          ...(note ? { note } : {}),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      const data = (await res.json()) as { reviewed_by: string; reviewed_at: string };
      const at = data.reviewed_at ? new Date(data.reviewed_at).toLocaleString() : new Date().toLocaleString();
      toast.success(t("dash.toast.signed", { by: data.reviewed_by }));
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
          ? {
              ...prev,
              status: "AUTO_CLEARED",
              reviewed_by: data.reviewed_by,
              reviewed_at: data.reviewed_at,
              details: {
                ...prev.details,
                status: "AUTO_CLEARED",
                audit_log: appendAuditEvent(prev.details.audit_log, {
                  at: new Date().toISOString(),
                  action: "SIGNED",
                  by: data.reviewed_by,
                  note: note ?? `Signed off by ${doctor}`,
                  status: "AUTO_CLEARED",
                }),
              },
            }
          : prev
      );
      // quiet refresh of stats + counts (list already flipped optimistically)
      quietRefreshRef.current = true;
      setSignOffNote("");
      void loadAll(true);
      void loadAudit(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dash.toast.signFail"));
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
          reviewed_by: `${doctor}${DEMO_SIGNER_SUFFIX}`,
          note: `Sign-off reopened by ${doctor} — case returned to the ${previousStatus === "URGENT" ? "urgent" : "review"} queue`,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `API returned ${res.status}`);
      }
      toast.success(
        t("dash.toast.reopened", { lane: previousStatus === "URGENT" ? t("dash.queueUrgent") : t("dash.queueReview") })
      );
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
          ? {
              ...prev,
              status: previousStatus,
              reviewed_by: null,
              reviewed_at: null,
              details: {
                ...prev.details,
                status: previousStatus,
                audit_log: appendAuditEvent(prev.details.audit_log, {
                  at: new Date().toISOString(),
                  action: "REOPENED",
                  by: `${doctor}${DEMO_SIGNER_SUFFIX}`,
                  note: `Sign-off reopened by ${doctor} — case returned to the ${previousStatus === "URGENT" ? "urgent" : "review"} queue`,
                  status: previousStatus,
                }),
              },
            }
          : prev
      );
      // quiet refresh of stats + counts (list already flipped optimistically)
      quietRefreshRef.current = true;
      void loadAll(true);
      void loadAudit(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dash.toast.reopenFail"));
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
        body: JSON.stringify({
          patient_ids: ids,
          reviewed_by: `${doctor}${DEMO_SIGNER_SUFFIX}`,
          ...(bulkNote.trim() ? { note: bulkNote.trim().slice(0, 400) } : {}),
        }),
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
          data.signed_count === 1
            ? t("dash.toast.bulkSignedOne")
            : t("dash.toast.bulkSigned", { n: data.signed_count })
        );
      }
      if (data.failed.length > 0) {
        const first = data.failed[0];
        toast.error(
          data.failed.length === 1
            ? t("dash.toast.bulkFailOne", { first: `${first.patient_id}: ${first.error}` })
            : t("dash.toast.bulkFail", { n: data.failed.length, first: `${first.patient_id}: ${first.error}` })
        );
      }
      setSelected(new Set());
      setBulkNote("");
      quietRefreshRef.current = true;
      void loadAll(true);
      void loadAudit(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dash.toast.bulkFailApi"));
    } finally {
      setBulkBusy(false);
      setBulkConfirmOpen(false);
    }
  }

  function handleRegisterPdf() {
    // respect the active camp-day filter — a day-scoped register stays day-scoped on paper
    const signedRows = (allRows ?? []).filter(
      (r) => r.reviewed_by && (dayKey === "all" || dayKeyOf(r.created_at) === dayKey)
    );
    if (signedRows.length === 0) {
      toast.info(t("dash.toast.noSigned"));
      return;
    }
    downloadRegisterPdf(signedRows as RegisterRow[]);
    toast.success(
      t("dash.toast.registerPdf", { n: signedRows.length, s: signedRows.length === 1 ? "" : "s" })
    );
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
    <section id="dashboard-root" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      {/* print-only header — the paper day-register banner */}
      <div className="print-only mb-4 border-b-2 border-black pb-3 text-black">
        <p className="text-xl font-bold">{t("dash.print.title")}</p>
        <p className="text-sm">{t("dash.print.generated", { date: new Date().toLocaleString() })}</p>
        {dayKey !== "all" && campDays.length > 1 && (() => {
          const day = campDays.find((d) => d.key === dayKey);
          if (!day) return null;
          const label = `${t("dash.day.tab", { n: day.day })} · ${new Date(day.key + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
          return <p className="text-sm font-semibold">{t("dash.day.print", { day: label })}</p>;
        })()}
        <p className="text-sm">{t("dash.print.doctor", { name: doctor })}</p>
      </div>
      <SectionHeading
        className="print:hidden"
        eyebrow={t("dash.eyebrow")}
        title={
          <>
            {t("dash.title.a")}
            <span className="text-glow-cyan">{t("dash.title.b")}</span>
          </>
        }
        sub={t("dash.sub")}
      />
      <Reveal className="-mt-4 mb-10 flex justify-center print:hidden">
        <span className="chip border-[#FBBF24]/40 bg-[#2A2210]/60 text-[#FBBF24]">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          {t("dash.demoChip")}
        </span>
      </Reveal>

      {/* 1 ── Stats cards */}
      <Reveal delay={0.05} className="print:hidden">
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
              index={0}
              icon={ScanEye}
              label={t("dash.stats.screened")}
              sub={t("dash.stats.screenedSub")}
              value={stats.screenedToday}
              valueClass="text-[#22D3EE]"
              iconClass="border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]"
              loading={allLoading}
            />
            <StatCard
              index={1}
              icon={Crosshair}
              label={t("dash.stats.referable")}
              sub={t("dash.stats.referableSub")}
              value={stats.referable}
              valueClass="text-[#FBBF24]"
              iconClass="border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]"
              loading={allLoading}
            />
            <StatCard
              index={2}
              icon={ClipboardList}
              label={t("dash.stats.queue")}
              sub={t("dash.stats.queueSub")}
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
              index={3}
              icon={ShieldCheck}
              label={t("dash.stats.signed")}
              sub={
                stats.signedToday > 0
                  ? `${stats.signedToday} ${t("dash.stats.signedToday")}`
                  : t("dash.stats.signedSub")
              }
              value={stats.signedCount}
              valueClass="text-[#34D399]"
              iconClass="border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
              loading={allLoading}
            />
            <StatCard
              index={4}
              icon={Timer}
              label={t("dash.stats.avg")}
              sub={t("dash.stats.avgSub")}
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
      <Reveal delay={0.1} className="mt-8 print:hidden">
        <div className="flex flex-col gap-3">
          <div className="order-2 drishti-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Queue filters">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const label =
              tab.key === "all" ? t("dash.tab.all")
              : tab.key === "auto_cleared" ? t("dash.tab.auto")
              : tab.key === "needs_review" ? t("dash.tab.review")
              : tab.key === "urgent" ? t("dash.tab.urgent")
              : t("dash.tab.rejected");
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all duration-200 sm:text-sm",
                  active
                    ? "border-[#22D3EE]/40 bg-[#22D3EE]/15 text-[#22D3EE]"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
                )}
              >
                {label}
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-[#22D3EE]/20 text-[#22D3EE]" : "bg-white/5 text-muted-foreground"
                  )}
                >
                  {allRows ? counts[tab.key] : "·"}
                </span>
                {tab.key === "all" && allRows && (allRows ?? []).some((r) => r.reviewed_by) && (() => {
                  const signedTotal = (allRows ?? []).filter((r) => r.reviewed_by).length;
                  return (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full border border-[#34D399]/40 bg-[#0A2E24]/70 px-1.5 py-0.5 text-[10px] font-semibold text-[#34D399]"
                      title={`${signedTotal} signed-off case${signedTotal === 1 ? "" : "s"} in the register`}
                    >
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      {signedTotal}
                    </span>
                  );
                })()}
                {tab.key === "auto_cleared" && allRows && signedAuto > 0 && (
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
          <div className="order-1 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            {/* reviewing doctor identity — recorded as the signer on every sign-off */}
            <Select
              value={doctor}
              onValueChange={(v) => {
                setDoctor(v);
                try {
                  window.localStorage.setItem(DOCTOR_STORAGE_KEY, v);
                } catch {
                  /* private mode — in-memory only */
                }
              }}
            >
              <SelectTrigger
                aria-label={t("dash.doctor.label")}
                title={t("dash.doctor.title")}
                className="h-11 w-full gap-2 rounded-lg border-white/15 bg-white/[0.03] text-sm text-foreground transition-colors hover:border-[#22D3EE]/40 focus-visible:border-[#22D3EE]/50 focus-visible:ring-[#22D3EE]/25 data-[state=open]:border-[#22D3EE]/50"
              >
                <Stethoscope className="h-4 w-4 shrink-0 text-[#22D3EE]" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#0B1526]/95 text-foreground backdrop-blur-xl">
                {DOCTOR_ROSTER.map((name) => (
                  <SelectItem
                    key={name}
                    value={name}
                    className="text-sm focus:bg-[#22D3EE]/10 focus:text-[#22D3EE]"
                  >
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-60">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dash.search")}
                aria-label={t("dash.search")}
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
              {t("dash.registerPdf")}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-[#22D3EE]/40 hover:text-[#22D3EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Print the current register — your browser's print dialog can save it as a PDF"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t("dash.print")}
            </button>
            <a
              href={
                selectedIds.length > 0
                  ? `/api/patients/export?ids=${encodeURIComponent(selectedIds.join(","))}`
                  : dayKey !== "all"
                    ? `/api/patients/export?filter=${filter}&day=${dayKey}`
                    : `/api/patients/export?filter=${filter}`
              }
              download
              className={cn(
                "flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border bg-white/[0.03] px-4 py-2 text-xs font-medium transition-all duration-200",
                selectedIds.length > 0
                  ? "border-[#34D399]/45 text-[#34D399] hover:border-[#34D399]/70"
                  : "border-white/15 text-muted-foreground hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
              )}
              title={
                selectedIds.length > 0
                  ? `Download the ${selectedIds.length} selected case${selectedIds.length === 1 ? "" : "s"} as CSV`
                  : dayKey !== "all"
                    ? `Download the current queue as a CSV register — Day ${campDays.find((d) => d.key === dayKey)?.day ?? ""} only (camp-day scope travels with the export)`
                    : "Download the current queue as a CSV register"
              }
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              {selectedIds.length > 0
                ? `${t("dash.exportSelected")} (${selectedIds.length})`
                : t("dash.exportCsv")}
            </a>
          </div>
        </div>
        {query.trim() !== "" && rows && !rowsLoading && !rowsError && (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            Showing <span className="tabular font-semibold text-[#22D3EE]">{visibleRows.length}</span> of{" "}
            <span className="tabular">{rows.length}</span> cases in this lane matching “{query.trim()}”
          </p>
        )}
        {/* camp-day register filter — one chip per screening day in the register */}
        {campDays.length > 1 && (
          <div
            className="drishti-scroll -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label={t("dash.day.group")}
          >
            {([
              {
                key: "all",
                day: 0,
                count: allDaysSummary.count,
                signed: allDaysSummary.signed,
                referable: allDaysSummary.referable,
                unsignedReferable: allDaysSummary.unsignedReferable,
              },
              ...campDays,
            ] as Array<{ key: string; day: number; count: number; signed: number; referable: number; unsignedReferable: number }>).map((d) => {
              const active = dayKey === d.key;
              const isAll = d.key === "all";
              const full = isAll
                ? null
                : new Date(d.key + "T00:00:00").toLocaleDateString("en-GB", {
                    weekday: "short", day: "numeric", month: "short", year: "numeric",
                  });
              // per-day mini-summary in the tooltip: cases · signed · referable
              const summary = t("dash.day.summary", {
                count: d.count,
                s: d.count === 1 ? "" : "s",
                signed: d.signed,
                referable: d.referable,
              });
              const tip = full
                ? `${t("dash.day.tab", { n: d.day })} — ${full} · ${summary}`
                : `${t("dash.day.all")} · ${summary}`;
              // referable-status dot: amber while the day still has unsigned referable
              // cases, green once every referable case on that day has been signed off
              const dotTone =
                d.referable > 0 ? (d.unsignedReferable > 0 ? "#FBBF24" : "#34D399") : null;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDayKey(d.key)}
                  aria-pressed={active}
                  title={tip}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs",
                    active
                      ? "border-[#22D3EE]/45 bg-[#22D3EE]/12 text-[#22D3EE] shadow-[0_0_14px_rgba(34,211,238,0.14)]"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/25 hover:text-foreground"
                  )}
                >
                  {isAll && <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
                  {isAll ? t("dash.day.all") : t("dash.day.tab", { n: d.day })}
                  {dotTone && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        active && d.unsignedReferable > 0 && "animate-pulse"
                      )}
                      style={{ background: dotTone, boxShadow: `0 0 6px ${dotTone}` }}
                    />
                  )}
                  <span
                    className={cn(
                      "tabular rounded-full px-1.5 py-px text-[9.5px] font-semibold",
                      active ? "bg-[#22D3EE]/20 text-[#22D3EE]" : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    {allRows ? d.count : "·"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* 3 ── Patient table (desktop) — print:block keeps the register visible on paper below the md breakpoint */}
      <Reveal delay={0.15} className="mt-4 hidden md:block print:block">
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
                    <TableHead className="w-10 pr-2 print:hidden">
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
                    <TableHead className="hidden text-xs uppercase tracking-wider print:table-cell lg:table-cell">DME</TableHead>
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
                          "cursor-pointer border-white/5 transition-shadow focus-visible:bg-white/[0.05] focus-visible:outline-none",
                          "hover:shadow-[inset_2px_0_0_0_rgba(34,211,238,0.65)]",
                          isSelected
                            ? "bg-[#34D399]/[0.06] hover:bg-[#34D399]/[0.09]"
                            : "hover:bg-white/[0.03]"
                        )}
                      >
                        <TableCell className="w-10 py-3 pr-2 print:hidden" onClick={(e) => e.stopPropagation()}>
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
                        <TableCell className="hidden py-3 print:table-cell lg:table-cell">
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
      <div className="mt-4 grid gap-3 print:hidden md:hidden">
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
                  "relative overflow-hidden p-3",
                  !selectable && "glass-card-hover cursor-pointer"
                )}
                {...(!selectable ? { hover: true } : {})}
              >
                {/* grade-color spine — scannable severity cue on mobile */}
                {gColor && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                    style={{ background: gColor, opacity: 0.8, boxShadow: `0 0 8px ${gColor}66` }}
                  />
                )}
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
                        {t("dash.signedChip")}
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
          className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 print:hidden sm:bottom-8"
          role="region"
          aria-label="Bulk sign-off actions"
        >
          <div className="rise-in pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[#34D399]/35 bg-[#0B1526]/95 p-3 shadow-[0_10px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:w-auto">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]">
              <ListChecks className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="tabular text-sm font-semibold leading-tight text-foreground">
                {selectedIds.length} {selectedIds.length === 1 ? t("dash.bulk.selected") : t("dash.bulk.selectedPlural")}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {t("dash.bulk.ready")}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                className="min-h-10 bg-[#34D399] font-semibold text-[#05261B] hover:bg-[#2BC48B]"
                onClick={() => setBulkConfirmOpen(true)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {t("dash.bulk.signAll")}
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

      {/* 3d ── Register activity timeline (audit trail) */}
      <Reveal delay={0.2} className="mt-8 print:hidden">
        <GlassCard className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]">
                <History className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-foreground">{t("dash.activity.title")}</p>
                <p className="text-xs text-muted-foreground">{t("dash.activity.sub")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAudit()}
              disabled={auditLoading}
              aria-label={t("dash.activity.refresh")}
              title={t("dash.activity.refresh")}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-[#22D3EE]/40 hover:text-[#22D3EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", auditLoading && "animate-spin")} aria-hidden="true" />
              {t("dash.activity.refresh")}
            </button>
          </div>

          {/* decision-type filter chips (SIGNED / REOPENED / ROUTED) */}
          {auditEvents && auditEvents.length > 0 && (
            <div
              className="mt-4 flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("dash.activity.filterGroup")}
            >
              {([
                { key: "ALL", label: t("dash.activity.all") },
                { key: "SIGNED", label: t("dash.activity.signed") },
                { key: "REOPENED", label: t("dash.activity.reopened") },
                { key: "ROUTED", label: t("dash.activity.routed") },
              ] as Array<{ key: AuditActionFilter; label: string }>).map((f) => {
                const active = auditFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setAuditFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-[#22D3EE]/45 bg-[#22D3EE]/12 text-[#22D3EE] shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                        : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/25 hover:text-foreground"
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 py-px text-[9.5px] font-semibold",
                        active ? "bg-[#22D3EE]/20 text-[#22D3EE]" : "bg-white/5 text-muted-foreground"
                      )}
                    >
                      {auditCounts[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="drishti-scroll mt-4 max-h-96 overflow-y-auto pr-1">
            {auditError ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <TriangleAlert className="h-5 w-5 text-[#F87171]" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("dash.activity.error")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-10 border-white/15 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
                  onClick={() => void loadAudit()}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t("dash.retry")}
                </Button>
              </div>
            ) : auditLoading && !auditEvents ? (
              <div className="ml-3 space-y-3 border-l border-white/10 py-1 pl-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : !auditEvents || auditEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <History className="h-6 w-6 text-[#22D3EE]/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("dash.activity.empty")}</p>
              </div>
            ) : filteredAudit.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <History className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("dash.activity.noneMatch")}</p>
              </div>
            ) : (
              <ol className="relative ml-3 space-y-1 border-l border-white/10 pl-6" aria-label={t("dash.activity.title")}>
                {filteredAudit.map((ev, i) => {
                  const meta =
                    ev.action === "SIGNED"
                      ? { icon: ShieldCheck, cls: "border-[#34D399]/50 bg-[#0A2E24] text-[#34D399]", label: t("dash.activity.signed") }
                      : ev.action === "REOPENED"
                        ? { icon: Undo2, cls: "border-[#FBBF24]/50 bg-[#2A2210] text-[#FBBF24]", label: t("dash.activity.reopened") }
                        : { icon: ArrowRightLeft, cls: "border-[#22D3EE]/50 bg-[#0A1B2E] text-[#22D3EE]", label: t("dash.activity.routed") };
                  const Icon = meta.icon;
                  return (
                    <li
                      key={`${ev.patient_id}-${ev.at}-${i}`}
                      className="group relative rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <span
                        className={cn(
                          "absolute -left-[33px] top-3 flex h-5.5 w-5.5 items-center justify-center rounded-full border",
                          meta.cls,
                          i === 0 && "animate-pulse"
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <button
                          type="button"
                          onClick={() => openReport(ev.patient_id)}
                          title={t("dash.activity.openCase")}
                          className="font-display text-sm font-semibold text-foreground underline-offset-4 hover:text-[#22D3EE] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {ev.patient_id}
                        </button>
                        <span className={cn("text-xs font-semibold", meta.cls.split(" ").pop())}>{meta.label}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {ev.by.split(" (")[0]}
                        </span>
                        <span className="tabular ml-auto text-[11px] text-muted-foreground">{fmtDate(ev.at)}</span>
                      </div>
                      {ev.note && (
                        <p className="mt-1 text-xs leading-snug text-muted-foreground/85" title={ev.note}>
                          {ev.note}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {!auditError && auditEvents && auditEvents.length > 0 && auditFilter === "ALL" && auditTotal > auditEvents.length && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t("dash.activity.showing", { n: auditEvents.length, total: auditTotal })}
            </p>
          )}
          {!auditError && auditEvents && auditEvents.length > 0 && auditFilter !== "ALL" && (
            <p className="mt-3 text-[11px] text-muted-foreground" role="status">
              {t("dash.activity.filtered", {
                n: filteredAudit.length,
                s: filteredAudit.length === 1 ? "" : "s",
                type:
                  auditFilter === "SIGNED"
                    ? t("dash.activity.signed").toLowerCase()
                    : auditFilter === "REOPENED"
                      ? t("dash.activity.reopened").toLowerCase()
                      : t("dash.activity.routed").toLowerCase(),
                total: auditTotal || auditEvents.length,
              })}
            </p>
          )}
        </GlassCard>
      </Reveal>

      {/* 4 ── Report modal */}
      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "card-accent-top max-h-[85vh] max-w-4xl gap-0 overflow-y-auto overflow-x-hidden border-[#22D3EE]/25 bg-[#0B1526]/95 p-0 backdrop-blur-xl sm:max-w-4xl drishti-scroll"
          )}
        >
          {/* a11y: loading/error branches render no visible DialogTitle —
              provide a screen-reader one so Radix never renders a title-less dialog */}
          {(detailLoading || detailError) && (
            <DialogHeader className="sr-only">
              <DialogTitle>{openId ?? ""}</DialogTitle>
              <DialogDescription>{detailError ? "Report failed to load" : "Loading report"}</DialogDescription>
            </DialogHeader>
          )}
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
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                        {l.i18nKey ? t(l.i18nKey) : l.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("dash.gradcamNote")}
                  </p>
                </div>

                {/* RIGHT — trust breakdown */}
                <div className="space-y-5">
                  <div className="flex items-center gap-5">
                    <ScoreDial
                      value={detailResult.trust.trust_score}
                      size={128}
                      label={t("screen.trustScore")}
                      sublabel={detailResult.trust.trust_level}
                    />
                    <div className="min-w-0 space-y-2">
                      <TrustChip level={detailResult.trust.trust_level} />
                      <p className="text-sm leading-snug text-muted-foreground">{detailResult.trust.route}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-around rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <ScoreDial value={detailResult.gate.quality_score} size={90} label={t("screen.quality")} />
                    <ScoreDial value={detailResult.explainability.consistency} size={90} label={t("screen.consistency")} />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <LesionStat count={detailResult.evidence.ma_count} label="MA" color="#e0331f" />
                    <LesionStat count={detailResult.evidence.hem_count} label="HEM" color="#9b1c1c" />
                    <LesionStat count={detailResult.evidence.ex_count} label="EX" color="#f2d66c" />
                  </div>

                  {!isRejected ? (
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("dash.cnnTop3")}
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
                        <p className="text-sm font-semibold text-[#F87171]">{t("dash.gateFailed")}</p>
                        <p className="text-xs text-[#F8A5A5]/80">{detailResult.gate.message}</p>
                      </div>
                    </div>
                  )}

                  {detailResult.evidence.dme_risk && !isRejected && (
                    <div className="flex items-start gap-2 rounded-lg border border-[#F87171]/40 bg-[#2E0F12]/70 p-3">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F87171]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[#F87171]">{t("dash.dmeFlagged")}</p>
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

              {/* per-case audit history — every persisted decision for THIS case */}
              {(() => {
                const log = [...(detailResult.audit_log ?? [])].reverse();
                return (
                  <div className="border-t border-white/10 px-6 py-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("dash.caseAudit.title")}
                      {log.length > 0 && (
                        <span className="tabular rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {log.length}
                        </span>
                      )}
                    </p>
                    {log.length === 0 ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{t("dash.caseAudit.empty")}</p>
                    ) : (
                      <ol className="mt-3 space-y-2.5">
                        {log.map((ev, i) => {
                          const meta =
                            ev.action === "SIGNED"
                              ? { icon: ShieldCheck, cls: "border-[#34D399]/50 bg-[#0A2E24] text-[#34D399]", label: t("dash.activity.signed") }
                              : ev.action === "REOPENED"
                                ? { icon: Undo2, cls: "border-[#FBBF24]/50 bg-[#2A2210] text-[#FBBF24]", label: t("dash.activity.reopened") }
                                : { icon: ArrowRightLeft, cls: "border-[#22D3EE]/50 bg-[#0A1B2E] text-[#22D3EE]", label: t("dash.activity.routed") };
                          const Icon = meta.icon;
                          return (
                            <li
                              key={`${ev.at}-${ev.action}-${i}`}
                              className="flex items-start gap-2.5"
                            >
                              <span
                                className={cn(
                                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                  meta.cls
                                )}
                                aria-hidden="true"
                              >
                                <Icon className="h-2.5 w-2.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                  <span className={cn("text-xs font-semibold", meta.cls.split(" ").pop())}>{meta.label}</span>
                                  <span className="text-[11px] text-muted-foreground">{ev.by.split(" (")[0]}</span>
                                  <span className="tabular ml-auto text-[11px] text-muted-foreground">{fmtDate(ev.at)}</span>
                                </div>
                                {ev.note && (
                                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/85">{ev.note}</p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                );
              })()}

              {/* single-case sign-off note — parity with the bulk sign-off note;
                  persisted verbatim in the audit trail + register review_note */}
              {canSign && (
                <div className="space-y-1.5 px-6 pb-1">
                  <label htmlFor="signoff-note" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <FilePenLine className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
                    {t("dash.bulk.noteLabel")}
                  </label>
                  <Textarea
                    id="signoff-note"
                    value={signOffNote}
                    onChange={(e) => setSignOffNote(e.target.value)}
                    placeholder={t("dash.bulk.notePlaceholder")}
                    rows={2}
                    maxLength={400}
                    disabled={signingOff === openId}
                    className="resize-none border-white/15 bg-white/[0.03] text-sm placeholder:text-muted-foreground/60 focus-visible:border-[#22D3EE]/50 focus-visible:ring-[#22D3EE]/25"
                  />
                </div>
              )}
              <DialogFooter className="flex-col gap-3 border-t border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("dash.demoCase")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="min-h-11 border-white/15 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]"
                    onClick={() => downloadReportPdf(detailResult)}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {t("dash.pdf")}
                  </Button>
                  {isSignedOffHere && openId ? (
                    <span className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span
                        className="chip min-h-11 border-[#34D399]/40 bg-[#0A2E24]/60 text-[#34D399]"
                        title={reviewNoteText}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("dash.signedOffBy")} · {(signedOff[openId]?.by ?? detail?.reviewed_by ?? "").split(" (")[0]}
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
                        {signingOff === openId ? t("dash.reopening") : t("dash.undo")}
                      </Button>
                    </span>
                  ) : canSign && openId ? (
                    <Button
                      className="min-h-11 bg-[#34D399] font-semibold text-[#05261B] hover:bg-[#2BC48B] disabled:opacity-60"
                      onClick={() => void handleSignOff(openId)}
                      disabled={signingOff === openId}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {signingOff === openId ? t("dash.signingOff") : t("dash.signOff")}
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
            <AlertDialogTitle className="font-display text-lg">
              {t("dash.reopen.title", { id: reopenTarget ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {t("dash.reopen.body.a")}
              <span className="font-semibold text-[#FBBF24]">
                {reopenTarget && signedOff[reopenTarget]?.previousStatus === "URGENT"
                  ? t("dash.reopen.queueUrgent")
                  : t("dash.reopen.queueReview")}
              </span>
              {t("dash.reopen.body.b")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 border-white/15 bg-transparent hover:bg-white/5 hover:text-foreground">
              {t("dash.reopen.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-[#FBBF24] font-semibold text-[#2A2210] hover:bg-[#EAB308]"
              onClick={(e) => {
                e.preventDefault();
                if (reopenTarget) void handleReopen(reopenTarget);
              }}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              {t("dash.reopen.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* 6 ── Bulk sign-off confirmation */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent className="border-[#34D399]/30 bg-[#0B1526]/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg">
              {selectedIds.length === 1 ? t("dash.bulk.titleOne") : t("dash.bulk.titleMany", { n: selectedIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {t("dash.bulk.body.a")}
              <span className="font-semibold text-[#34D399]">{t("dash.bulk.body.hl")}</span>
              {t("dash.bulk.body.b")}
              <span className="tabular text-foreground">
                {selectedIds.slice(0, 4).join(", ")}
                {selectedIds.length > 4 ? ` + ${selectedIds.length - 4} more` : ""}
              </span>
              {t("dash.bulk.body.c")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="bulk-note" className="text-xs font-medium text-foreground">
              {t("dash.bulk.noteLabel")}
            </label>
            <Textarea
              id="bulk-note"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder={t("dash.bulk.notePlaceholder")}
              rows={2}
              maxLength={400}
              disabled={bulkBusy}
              className="resize-none border-white/15 bg-white/[0.03] text-sm placeholder:text-muted-foreground/60 focus-visible:border-[#22D3EE]/50 focus-visible:ring-[#22D3EE]/25"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-11 border-white/15 bg-transparent hover:bg-white/5 hover:text-foreground"
              disabled={bulkBusy}
            >
              {t("dash.bulk.cancel")}
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
              {bulkBusy ? t("dash.bulk.signing") : t("dash.bulk.confirm", { n: selectedIds.length })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
