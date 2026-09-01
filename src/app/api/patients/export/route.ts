import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients/export?filter=all|auto_cleared|needs_review|urgent|rejected
 *                     or ?ids=ID1,ID2,…   (bulk-selection export)
 * CSV export of the screening register (for program managers) with the full
 * audit trail (reviewed_by / reviewed_at / review_note) plus the per-case
 * decision log (audit_events count + compact audit_trail) — column parity
 * with the register activity feed.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filter = params.get("filter") ?? "all";
  const idsParam = params.get("ids");

  // ids= wins over filter= — exports exactly the selected cases (order preserved)
  const ids = idsParam
    ? [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100)
    : null;

  const where = ids
    ? { patientId: { in: ids } }
    : filter === "auto_cleared"
      ? { status: "AUTO_CLEARED" }
      : filter === "needs_review"
        ? { status: "NEEDS_REVIEW" }
        : filter === "urgent"
          ? { status: "URGENT" }
          : filter === "rejected"
            ? { status: "REJECTED" }
            : {};

  const rows = await db.screening.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const ordered = ids ? ids.map((id) => rows.find((r) => r.patientId === id)).filter((r) => r != null) : rows;

  const esc = (v: string | number | boolean | null | undefined | Date) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "patient_id", "screened_at", "grade", "icdr_level", "confidence",
    "quality_score", "trust_score", "trust_level", "status", "dme_risk",
    "microaneurysms", "hemorrhages", "exudates", "vessel_density_pct",
    "consistency", "processing_ms", "reviewed_by", "reviewed_at", "review_note",
    "audit_events", "audit_trail",
  ];

  /** Compact one-line serialization of the persisted decision log. */
  const auditOf = (details: string | null): { count: number; trail: string } => {
    try {
      const parsed = JSON.parse(details ?? "null") as { audit_log?: unknown } | null;
      if (parsed && Array.isArray(parsed.audit_log)) {
        const trail = parsed.audit_log
          .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
          .map((e) =>
            [e.action, e.at, e.by, e.note]
              .filter((v) => v !== undefined && v !== null && v !== "")
              .map((v) => String(v))
              .join(" | ")
          )
          .join(" ;; ")
          .slice(0, 2000);
        return { count: parsed.audit_log.length, trail };
      }
    } catch {
      /* unparseable details → empty trail */
    }
    return { count: 0, trail: "" };
  };

  const lines = [header.join(",")];
  for (const r of ordered) {
    const audit = auditOf(r.details);
    lines.push([
      esc(r.patientId),
      esc(r.createdAt.toISOString()),
      esc(r.predictedClass),
      esc(r.classLevel),
      esc(r.confidence),
      esc(r.qualityScore),
      esc(r.trustScore),
      esc(r.trustLevel),
      esc(r.status),
      esc(r.dmeRisk),
      esc(r.maCount),
      esc(r.hemCount),
      esc(r.exCount),
      esc(r.vesselDensityPct),
      esc(r.consistency),
      esc(r.processingMs),
      esc(r.reviewedBy),
      esc(r.reviewedAt ? r.reviewedAt.toISOString() : ""),
      esc(r.reviewNote),
      audit.count > 0 ? esc(audit.count) : "",
      audit.trail ? esc(audit.trail) : "",
    ].join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = ids ? `selected-${ordered.length}` : filter;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="drishti-register-${scope}-${stamp}.csv"`,
    },
  });
}
