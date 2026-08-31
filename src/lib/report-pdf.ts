"use client";

import { jsPDF } from "jspdf";
import type { ScreeningResult } from "@/lib/drishti";
import { ICDR_CLASSES, VALIDATED_METRICS } from "@/lib/drishti";

/**
 * Clinical report PDF — matches the on-screen Clinical Report card.
 * Trust colors follow the DRISHTI language: green HIGH / amber MODERATE / red LOW.
 */
export function downloadReportPdf(result: ScreeningResult) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  const trustColor =
    result.trust.trust_level === "HIGH" ? "#17A06C" : result.trust.trust_level === "MODERATE" ? "#B7791F" : "#C0392B";

  // Header band
  doc.setFillColor(6, 11, 20);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(34, 211, 238);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("DRISHTI", M, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 190, 215);
  doc.text("Trust-Gated Diabetic Retinopathy Screening — Clinical Report", M, 18.5);
  doc.text(`Report ${result.patient_id}`, W - M, 12, { align: "right" });
  doc.text(new Date(result.created_at).toLocaleString(), W - M, 18.5, { align: "right" });

  let y = 38;

  // Verdict box
  const grade =
    result.classification.class_level >= 0
      ? ICDR_CLASSES.find((c) => c.level === result.classification.class_level)
      : undefined;
  doc.setDrawColor(trustColor.replace("#", ""));
  doc.setLineWidth(0.8);
  doc.roundedRect(M, y, W - 2 * M, 24, 3, 3, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 40, 55);
  doc.text(`Grade: ${result.classification.predicted_class}`, M + 5, y + 9);
  doc.setFontSize(10);
  doc.setTextColor(trustColor.replace("#", ""));
  doc.text(
    `Trust ${result.trust.trust_level} (score ${result.trust.trust_score.toFixed(3)}) — ${result.trust.route}`,
    M + 5,
    y + 17
  );
  y += 34;

  const section = (title: string, lines: string[]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 30, 45);
    doc.text(title, M, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 70, 85);
    lines.forEach((l) => {
      doc.text(l, M + 2, y);
      y += 5.2;
    });
    y += 3;
  };

  if (result.status === "REJECTED") {
    section("Trust Gate", [
      `Quality score: ${result.gate.quality_score.toFixed(2)} — REJECTED`,
      result.gate.message,
      "The pipeline halted at the quality gate. No AI grade was produced.",
      "Action: recapture the fundus image and re-run screening.",
    ]);
  } else {
    section("1 · Trust Gate (quality)", [
      `Quality score: ${result.gate.quality_score.toFixed(2)} — ${result.gate.accepted ? "ACCEPT" : "REJECT"}`,
      `CLAHE enhancement applied: ${result.gate.enhanced ? "yes" : "no"}`,
      result.gate.message,
    ]);
    section("2 · Evidence Engine (lesion detection)", [
      `Microaneurysms: ${result.evidence.ma_count}   Hemorrhages: ${result.evidence.hem_count}   Exudates: ${result.evidence.ex_count}`,
      `Vessel density: ${result.evidence.vessel_density_pct}%`,
      result.evidence.dme_risk ? `DME ALERT: ${result.evidence.dme_message}` : "DME: no macula-threatening exudates detected",
    ]);
    section("3 · CNN Grading (ICDR 0-4)", [
      `Predicted: ${result.classification.predicted_class} — confidence ${(result.classification.confidence * 100).toFixed(1)}%`,
      ...Object.entries(result.classification.probabilities)
        .filter(([, p]) => p > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`),
    ]);
    section("4 · Explainability (Grad-CAM + consistency)", [
      `Cross-mask consistency: ${result.explainability.consistency.toFixed(3)} (verdict ${result.explainability.verdict})`,
      `Centroid distance: ${result.explainability.centroid_distance_dd} DD   Region overlap: ${result.explainability.region_overlap}`,
    ]);
    section("5 · Trust routing", [
      `Trust score: ${result.trust.trust_score.toFixed(3)} — ${result.trust.trust_level}`,
      result.trust.route,
    ]);
    if (grade) {
      section("Referral timeline", [grade.action]);
    }
  }

  // Referral timeline strip for non-rejected
  if (result.status !== "REJECTED") {
    doc.setFillColor(240, 246, 252);
    doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 95, 115);
    doc.text(
      `Processing: gate ${result.timings_ms.gate}ms · evidence ${result.timings_ms.evidence}ms · classify ${result.timings_ms.classify}ms · explain ${result.timings_ms.explain}ms (total ${result.timings_ms.total}ms)`,
      M + 4,
      y + 5.5
    );
    doc.text("Simulated on-device run for demonstration — full model executes offline in the DRISHTI console.", M + 4, y + 10.5);
    y += 22;
  }

  // Footer honesty block
  doc.setDrawColor(220, 228, 238);
  doc.line(M, 268, W - M, 268);
  doc.setFontSize(7.8);
  doc.setTextColor(120, 135, 155);
  const honesty = [
    `Validated on ${VALIDATED_METRICS.dataset}: sensitivity ${VALIDATED_METRICS.sensitivity}% · specificity ${VALIDATED_METRICS.specificity}% · QWK ${VALIDATED_METRICS.qwk} · AUC ${VALIDATED_METRICS.auc}.`,
    "Research prototype — not a certified clinical device. Data: APTOS 2019, Aravind Eye Hospital (Kaggle); vessels: STARE (Clemson).",
    "Team Neural Minds · SIH 2026 · PS 26038 (MathWorks)",
  ];
  honesty.forEach((h, i) => doc.text(h, M, 274 + i * 4.5));

  doc.save(`DRISHTI-report-${result.patient_id}.pdf`);
}
