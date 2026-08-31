/**
 * Seed the Screening table with a realistic screening history for the
 * Doctor Dashboard. Demo data — labeled as demo in the UI.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEMO_CASES, runSimulatedPipeline } from "../src/lib/drishti";

const db = new PrismaClient();

const EXTRA_PATIENTS = [
  "RAMPUR-0117", "RAMPUR-0118", "RAMPUR-0121", "RAMPUR-0124", "RAMPUR-0126",
  "RAMPUR-0131", "RAMPUR-0133", "RAMPUR-0138", "RAMPUR-0140", "RAMPUR-0142",
  "RAMPUR-0145", "RAMPUR-0148",
];

async function main() {
  await db.screening.deleteMany();

  let dayOffset = 0;
  const now = Date.now();

  // The 5 showcase cases — today / yesterday
  for (const demo of DEMO_CASES) {
    const r = runSimulatedPipeline(demo.id);
    await db.screening.create({
      data: {
        patientId: r.patient_id,
        createdAt: new Date(now - dayOffset * 86400000 - 3600000),
        qualityScore: r.gate.quality_score,
        gateAccepted: r.gate.accepted,
        enhanced: r.gate.enhanced,
        maCount: r.evidence.ma_count,
        hemCount: r.evidence.hem_count,
        exCount: r.evidence.ex_count,
        vesselDensityPct: r.evidence.vessel_density_pct,
        dmeRisk: r.evidence.dme_risk,
        dmeMessage: r.evidence.dme_message,
        predictedClass: r.classification.predicted_class,
        classLevel: r.classification.class_level,
        confidence: r.classification.confidence,
        probabilities: JSON.stringify(r.classification.probabilities),
        consistency: r.explainability.consistency,
        verdict: r.explainability.verdict,
        centroidDistance: r.explainability.centroid_distance_dd,
        regionOverlap: r.explainability.region_overlap,
        trustScore: r.trust.trust_score,
        trustLevel: r.trust.trust_level,
        route: r.trust.route,
        status: r.status,
        details: JSON.stringify(r),
        processingMs: r.timings_ms.total,
      },
    });
    dayOffset = 1;
  }

  // A realistic mixed history from a PHC camp
  for (const pid of EXTRA_PATIENTS) {
    const r = runSimulatedPipeline(pid);
    const d = new Date(now - (2 + Math.floor(Math.random() * 12)) * 86400000);
    await db.screening.create({
      data: {
        patientId: r.patient_id,
        createdAt: d,
        qualityScore: r.gate.quality_score,
        gateAccepted: r.gate.accepted,
        enhanced: r.gate.enhanced,
        maCount: r.evidence.ma_count,
        hemCount: r.evidence.hem_count,
        exCount: r.evidence.ex_count,
        vesselDensityPct: r.evidence.vessel_density_pct,
        dmeRisk: r.evidence.dme_risk,
        dmeMessage: r.evidence.dme_message,
        predictedClass: r.classification.predicted_class,
        classLevel: r.classification.class_level,
        confidence: r.classification.confidence,
        probabilities: JSON.stringify(r.classification.probabilities),
        consistency: r.explainability.consistency,
        verdict: r.explainability.verdict,
        centroidDistance: r.explainability.centroid_distance_dd,
        regionOverlap: r.explainability.region_overlap,
        trustScore: r.trust.trust_score,
        trustLevel: r.trust.trust_level,
        route: r.trust.route,
        status: r.status,
        details: JSON.stringify(r),
        processingMs: r.timings_ms.total,
      },
    });
  }

  const count = await db.screening.count();
  console.log(`Seeded ${count} screenings.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
