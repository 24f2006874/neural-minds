import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients?filter=all|auto_cleared|needs_review|urgent|rejected
 * Returns screening rows for the Doctor Dashboard (newest first).
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
    take: 200,
  });

  return NextResponse.json({
    count: rows.length,
    patients: rows.map((r) => ({
      id: r.id,
      patient_id: r.patientId,
      created_at: r.createdAt,
      grade: r.predictedClass,
      class_level: r.classLevel,
      confidence: r.confidence,
      trust_score: r.trustScore,
      trust_level: r.trustLevel,
      status: r.status,
      dme_risk: r.dmeRisk,
      quality_score: r.qualityScore,
      processing_ms: r.processingMs,
    })),
  });
}
