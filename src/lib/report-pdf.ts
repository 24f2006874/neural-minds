"use client";

import { jsPDF } from "jspdf";
import type { ScreeningResult, TrustLevel } from "@/lib/drishti";
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

  // 6 · Audit history — every persisted human decision for THIS case (parity
  // with the report modal's "Case audit history" section). Newest last.
  const audit = (result.audit_log ?? []).slice(-20);
  if (audit.length > 0) {
    if (y > 215) {
      doc.addPage();
      y = 26;
    }
    const wrap = (s: string) => doc.splitTextToSize(s, 168) as string[];
    section(
      `6 · Audit history (${audit.length} recorded decision${audit.length === 1 ? "" : "s"})`,
      audit.flatMap((ev) => {
        const at = (() => {
          try {
            return new Date(ev.at).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
            });
          } catch {
            return ev.at;
          }
        })();
        const by = (ev.by ?? "").split(" (")[0];
        return wrap(`• ${ev.action} · ${by} · ${at}${ev.note ? ` — ${ev.note}` : ""}`);
      })
    );
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
    `Validated on ${VALIDATED_METRICS.dataset}: sensitivity ${VALIDATED_METRICS.sensitivity}% · specificity ${VALIDATED_METRICS.specificity}% · QWK ${VALIDATED_METRICS.qwk}.`,
    "Research prototype — not a certified clinical device. Data: APTOS 2019, Aravind Eye Hospital (Kaggle); vessels: STARE (Clemson).",
    "Team Neural Minds · SIH 2026 · PS 26038 (MathWorks)",
  ];
  honesty.forEach((h, i) => doc.text(h, M, 274 + i * 4.5));

  doc.save(`DRISHTI-report-${result.patient_id}.pdf`);
}

// ────────────────────────────────────────────────────────────
// Day-register PDF — batch export of doctor-signed cases
// ────────────────────────────────────────────────────────────

export interface RegisterRow {
  patient_id: string;
  created_at: string;
  grade: string;
  class_level: number;
  confidence: number;
  trust_level: TrustLevel;
  status: string;
  dme_risk: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

/**
 * Screening register PDF — one page per ~28 signed cases: summary header,
 * a per-case table (grade / trust / confidence / signer), referral mix and
 * the honesty footer. Built from the dashboard's signed-off rows.
 */
export function downloadRegisterPdf(rows: RegisterRow[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;

  const trustColor = (t: TrustLevel) =>
    t === "HIGH" ? "#17A06C" : t === "MODERATE" ? "#B7791F" : "#C0392B";
  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch {
      return "—";
    }
  };

  const pages = Math.max(1, Math.ceil(rows.length / 24));
  let page = 0;
  let y = 0;

  const newPage = () => {
    if (page > 0) doc.addPage();
    page++;
    // Header band
    doc.setFillColor(6, 11, 20);
    doc.rect(0, 0, W, 24, "F");
    doc.setTextColor(34, 211, 238);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("DRISHTI", M, 11);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 190, 215);
    doc.text("Screening Register — doctor-signed cases", M, 17.5);
    doc.text(`Page ${page}/${pages}`, W - M, 11, { align: "right" });
    doc.text(new Date().toLocaleString(), W - M, 17.5, { align: "right" });
    y = 34;
  };

  newPage();

  // Summary block (first page only)
  const referable = rows.filter((r) => r.class_level >= 2).length;
  const urgent = rows.filter((r) => r.trust_level === "LOW" || r.dme_risk).length;
  const dme = rows.filter((r) => r.dme_risk).length;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 40, 55);
  doc.text(`${rows.length} signed case${rows.length === 1 ? "" : "s"} in this register`, M, y);
  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 95, 115);
  doc.text(
    `Referable (grade ≥ Moderate NPDR): ${referable}   ·   Urgent-flagged (LOW trust or DME): ${urgent}   ·   DME risk: ${dme}`,
    M,
    y
  );
  y += 9;

  // Table header
  const cols = { id: M, date: M + 34, grade: M + 66, conf: M + 106, trust: M + 124, signed: M + 146 };
  doc.setFillColor(240, 246, 252);
  doc.roundedRect(M - 3, y - 4.5, W - 2 * M + 6, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60, 75, 95);
  doc.text("PATIENT", cols.id, y);
  doc.text("SCREENED", cols.date, y);
  doc.text("GRADE", cols.grade, y);
  doc.text("CONF", cols.conf, y);
  doc.text("TRUST", cols.trust, y);
  doc.text("SIGNED BY / AT", cols.signed, y);
  y += 7;

  const rowLine = (r: RegisterRow) => {
    if (y > 262) {
      newPage();
      // repeat column headers after a page break
      doc.setFillColor(240, 246, 252);
      doc.roundedRect(M - 3, y - 4.5, W - 2 * M + 6, 7, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(60, 75, 95);
      doc.text("PATIENT", cols.id, y);
      doc.text("SCREENED", cols.date, y);
      doc.text("GRADE", cols.grade, y);
      doc.text("CONF", cols.conf, y);
      doc.text("TRUST", cols.trust, y);
      doc.text("SIGNED BY / AT", cols.signed, y);
      y += 7;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(30, 40, 55);
    doc.text(doc.splitTextToSize(r.patient_id, 30)[0], cols.id, y);
    doc.setTextColor(95, 110, 130);
    doc.text(fmt(r.created_at), cols.date, y);
    doc.text(r.grade || "—", cols.grade, y);
    doc.text(`${(r.confidence * 100).toFixed(0)}%`, cols.conf, y);
    doc.setTextColor(trustColor(r.trust_level).replace("#", ""));
    doc.text(r.trust_level, cols.trust, y);
    doc.setTextColor(60, 75, 95);
    const signer = (r.reviewed_by ?? "—").split(" (")[0];
    const signedTxt = r.reviewed_at ? `${signer} · ${fmt(r.reviewed_at)}` : signer;
    doc.text(doc.splitTextToSize(signedTxt, 56)[0], cols.signed, y);
    y += 6;
    doc.setDrawColor(228, 234, 242);
    doc.setLineWidth(0.2);
    doc.line(M, y - 2.6, W - M, y - 2.6);
  };

  rows.forEach(rowLine);

  // Referral guidance footer
  if (y > 236) newPage();
  y += 6;
  doc.setDrawColor(220, 228, 238);
  doc.line(M, y, W - M, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 40, 55);
  doc.text("Referral guidance (ICDR)", M, y);
  y += 4.6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(110, 125, 145);
  ICDR_CLASSES.filter((c) => c.level >= 0)
    .slice(0, 5)
    .forEach((c) => {
      const short = c.short ? `${c.short} — ` : "";
      doc.text(doc.splitTextToSize(`• ${short}${c.action}`, 170), M, y);
      y += 4.2;
    });

  // Honesty block
  doc.setFontSize(7.5);
  doc.setTextColor(120, 135, 155);
  const honesty = [
    `Model: sensitivity ${VALIDATED_METRICS.sensitivity}% · specificity ${VALIDATED_METRICS.specificity}% · QWK ${VALIDATED_METRICS.qwk} (${VALIDATED_METRICS.dataset}).`,
    "Research prototype — not a certified clinical device. AI grading assists; every signed case above was approved by the reviewing doctor.",
    "Team Neural Minds · SIH 2026 · PS 26038 (MathWorks)",
  ];
  honesty.forEach((h, i) => doc.text(doc.splitTextToSize(h, 178), M, 274 + i * 4.4));

  doc.save(`DRISHTI-register-${new Date().toISOString().slice(0, 10)}.pdf`);
}
