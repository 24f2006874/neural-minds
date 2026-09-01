import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients/export?filter=all|auto_cleared|needs_review|urgent|rejected
 *                     or ?ids=ID1,ID2,…   (bulk-selection export)
 * CSV export of the screening register (for program managers) with the full
 * audit trail (reviewed_by / reviewed_at / review_note).
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
  ];

  const lines = [header.join(",")];
  for (const r of ordered) {
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
