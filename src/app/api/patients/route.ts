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

  try {
    const rows = await db.screening.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      count: rows.length,
      patients: rows.map((r) => ({
        id: r.id, patient_id: r.patientId, created_at: r.createdAt, grade: r.predictedClass,
        class_level: r.classLevel, confidence: r.confidence, trust_score: r.trustScore,
        trust_level: r.trustLevel, status: r.status, dme_risk: r.dmeRisk,
        quality_score: r.qualityScore, processing_ms: r.processingMs,
        reviewed_by: r.reviewedBy, reviewed_at: r.reviewedAt,
      })),
    });
  } catch (error) {
    const backend = process.env.NEXT_PUBLIC_DRISHTI_BACKEND_URL?.replace(/\/$/, "");
    if (!backend) throw error;
    const response = await fetch(`${backend}/api/patients`, { cache: "no-store" });
    if (!response.ok) throw error;
    const source = (await response.json()) as Array<Record<string, any>>;
    const patients = source
      .map((r) => {
        const trust = r.trust ?? {};
        const classification = r.classification ?? {};
        const evidence = r.evidence ?? {};
        const timings = r.timings_ms ?? {};
        const status = r.status ?? (trust.trust_level === "LOW" ? "URGENT" : trust.trust_level === "MODERATE" ? "NEEDS_REVIEW" : "AUTO_CLEARED");
        return {
          id: r.patient_id, patient_id: r.patient_id, created_at: r.created_at ?? new Date().toISOString(),
          grade: classification.predicted_class ?? "No DR (Level 0)", class_level: classification.class_level ?? 0,
          confidence: classification.confidence ?? 0, trust_score: trust.trust_score ?? 0,
          trust_level: trust.trust_level ?? "MODERATE", status, dme_risk: evidence.dme_risk ?? false,
          quality_score: r.gate?.quality_score ?? 0, processing_ms: timings.total ?? 0,
          reviewed_by: r.reviewed_by ?? null, reviewed_at: r.reviewed_at ?? null,
        };
      })
      .filter((r) => filter === "all" || (filter === "auto_cleared" ? r.status === "AUTO_CLEARED" : filter === "needs_review" ? r.status === "NEEDS_REVIEW" : filter === "urgent" ? r.status === "URGENT" : r.status === "REJECTED"));
    return NextResponse.json({ count: patients.length, patients });
  }
}
