import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSimulatedPipeline, ScreeningResult } from "@/lib/drishti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/screen — runs the full DRISHTI pipeline simulation.
 * multipart/form-data: file (retina image, optional for demo presets) + patient_id
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let patientId = "";
    let imageHint = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      patientId = String(form.get("patient_id") ?? "").trim();
      const file = form.get("file");
      if (file && typeof file === "object" && "size" in file) {
        imageHint = `${(file as File).size}`;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      patientId = String(body?.patient_id ?? "").trim();
    }

    if (!patientId) {
      return NextResponse.json({ error: "patient_id is required" }, { status: 400 });
    }

    const result: ScreeningResult = runSimulatedPipeline(patientId, imageHint);

    // Persist to the review-queue database (skip duplicates for demo presets)
    try {
      const exists = await db.screening.findUnique({ where: { patientId } });
      if (!exists) {
        await db.screening.create({
          data: {
            patientId: result.patient_id,
            qualityScore: result.gate.quality_score,
            gateAccepted: result.gate.accepted,
            enhanced: result.gate.enhanced,
            maCount: result.evidence.ma_count,
            hemCount: result.evidence.hem_count,
            exCount: result.evidence.ex_count,
            vesselDensityPct: result.evidence.vessel_density_pct,
            dmeRisk: result.evidence.dme_risk,
            dmeMessage: result.evidence.dme_message,
            predictedClass: result.classification.predicted_class,
            classLevel: result.classification.class_level,
            confidence: result.classification.confidence,
            probabilities: JSON.stringify(result.classification.probabilities),
            consistency: result.explainability.consistency,
            verdict: result.explainability.verdict,
            centroidDistance: result.explainability.centroid_distance_dd,
            regionOverlap: result.explainability.region_overlap,
            trustScore: result.trust.trust_score,
            trustLevel: result.trust.trust_level,
            route: result.trust.route,
            status: result.status,
            details: JSON.stringify(result),
            processingMs: result.timings_ms.total,
          },
        });
      }
    } catch (dbErr) {
      // Never fail a screening because of persistence issues
      console.error("screen persist failed", dbErr);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("screen failed", err);
    return NextResponse.json({ error: "Pipeline failed. Check /api/health." }, { status: 500 });
  }
}
