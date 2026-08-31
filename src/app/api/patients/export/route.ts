import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients/export?filter=all|auto_cleared|needs_review|urgent|rejected
 * CSV export of the screening register (for program managers).
 */
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";

  const where =
    filter === "auto_cleared"
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

  const esc = (v: string | number | boolean | null | undefined | Date) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "patient_id", "screened_at", "grade", "icdr_level", "confidence",
    "quality_score", "trust_score", "trust_level", "status", "dme_risk",
    "microaneurysms", "hemorrhages", "exudates", "vessel_density_pct",
    "consistency", "processing_ms", "reviewed_by", "reviewed_at",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
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
    ].join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="drishti-register-${filter}-${stamp}.csv"`,
    },
  });
}
