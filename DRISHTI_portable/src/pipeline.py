"""
============================================================================
DRISHTI - FULL PIPELINE (Modules 1 -> 2 -> 3 -> 4)
============================================================================
Run the complete DRISHTI screening on one fundus image:

    python3 src/pipeline.py  <image_path>  [--outdir results/]

Output: the "30-second validation report" (an annotated image a doctor can
verify in half a minute) + a machine-readable JSON result.
============================================================================
"""

import os
import sys
import json
import argparse
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import module1_quality_gate as m1
import module2_evidence_engine as m2
import module4_explainability as m4
from visualize import (draw_evidence_overlay, make_label_panel, hstack_panels,
                       quality_badge, CLR_GREEN_TXT, CLR_RED_TXT, CLR_AMBER_TXT,
                       CLR_WHITE, CLR_PANEL_BG)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE, "results")

# Colour-coded referral logic (mirrors clinical guidelines)
REFERRAL = {
    0: "No DR - re-screen in 12 months",
    1: "Mild NPDR - re-screen in 6-12 months",
    2: "Referable DR - see ophthalmologist within 3-6 months",
    3: "Severe NPDR - referral within 4 weeks",
    4: "Proliferative DR - URGENT referral within 1 week",
}


def run_full_pipeline(image_path, patient_id="DEMO-001", save_report=True,
                      outdir=None, verbose=True):
    """Complete DRISHTI screening run for one patient image."""
    outdir = outdir or OUT_DIR
    os.makedirs(outdir, exist_ok=True)
    img = cv2.imread(image_path)
    assert img is not None, f"cannot read image: {image_path}"

    print(f"\nDRISHTI PIPELINE | patient {patient_id} | {os.path.basename(image_path)}")
    print("-" * 60)

    # ================= MODULE 1: TRUST GATE =================
    print("[1/4] MODULE 1 - Trust Gate (quality)")
    decision, final_img, report = m1.quality_gate(img, verbose=verbose)
    if decision == "REJECT":
        print(f"[X] REJECTED at the gate: {report['reason']}")
        if save_report:
            rejected = quality_badge(img, report)
            panel = make_label_panel(rejected,
                                     f"MODULE 1: REJECTED - recapture needed",
                                     CLR_RED_TXT, f"quality {report['quality_score']:.2f}")
            out = os.path.join(outdir, f"{patient_id}_report.png")
            cv2.imwrite(out, panel)
        return {"patient_id": patient_id, "gate": "REJECT",
                "quality": {k: v for k, v in report.items() if k != "mask"},
                "reason": report["reason"]}

    # ================= MODULE 2: EVIDENCE =================
    print("[2/4] MODULE 2 - Evidence Engine (vessels, lesions)")
    evidence = m2.analyze(final_img, report["mask"], verbose=verbose)

    # ================= MODULE 3+4: CLASSIFY + EXPLAIN =================
    print("[3/4] MODULE 3 - CNN classification")
    print("[4/4] MODULE 4 - Grad-CAM + consistency + trust")
    explanation = m4.explain(final_img, evidence, report["quality_score"],
                             verbose=verbose)

    # ================= RESULT PACKAGE =================
    pred = explanation["predicted_class"]
    result = {
        "patient_id": patient_id,
        "image": image_path,
        "gate": {"quality_score": report["quality_score"],
                 "enhanced": bool(report.get("enhanced"))},
        "evidence": {
            "microaneurysms": evidence["ma_count"],
            "hemorrhages": evidence["hem_count"],
            "hard_exudates": evidence["ex_count"],
            "vessel_density_pct": round(evidence["vessel_density"] * 100, 1),
            "optic_disc": [int(evidence["optic_disc"][0]),
                           int(evidence["optic_disc"][1]),
                           round(float(evidence["optic_disc"][2]), 1)],
            "fovea": [int(evidence["fovea"][0]), int(evidence["fovea"][1])],
            "dme_risk": evidence["dme_risk"],
            "dme_message": evidence["dme_message"],
        },
        "classification": {
            "predicted_class": explanation["predicted_label"],
            "confidence": explanation["confidence"],
            "probabilities": explanation["probabilities"],
        },
        "explainability": {
            "consistency": explanation["consistency"]["consistency"],
            "consistency_verdict": explanation["consistency"]["verdict"],
            "centroid_distance_dd": explanation["consistency"]["centroid_distance_dd"],
            "region_overlap": explanation["consistency"]["region_overlap"],
        },
        "trust": explanation["trust"],
        "recommendation": REFERRAL[pred] + (" + DME ALERT: " + evidence["dme_message"]
                                            if evidence["dme_risk"] else ""),
    }

    if save_report:
        build_report_image(img, final_img, report, evidence, explanation,
                           result, patient_id, outdir)
    return result


# ==========================================================================
# THE 30-SECOND CLINICAL REPORT (the image doctors verify quickly)
# ==========================================================================
def build_report_image(original, enhanced, report, evidence, explanation,
                       result, patient_id, outdir):
    """
    Layout (designed for <30 second human verification):
      Row 1: original + quality gate | enhanced | Grad-CAM overlay | evidence map
      Row 2: summary card with grade, confidence, lesions, DME, trust, referral
    """
    h, w = original.shape[:2]
    target_h = 500

    # ---- Panel 1: original with quality badge ----
    p1 = quality_badge(original, report)

    # ---- Panel 2: enhanced image ----
    p2 = enhanced.copy()

    # ---- Panel 3: Grad-CAM heatmap overlaid on image ----
    cam = cv2.resize(explanation["gradcam"], (w, h))
    heat = cv2.applyColorMap(cam, cv2.COLORMAP_JET)
    p3 = cv2.addWeighted(enhanced, 0.55, heat, 0.45, 0)

    # ---- Panel 4: evidence overlay ----
    p4 = draw_evidence_overlay(enhanced, evidence)

    panels = [
        make_label_panel(p1, "1. QUALITY GATE", CLR_GREEN_TXT,
                         f"score {report['quality_score']:.2f}"),
        make_label_panel(p2, "2. ENHANCED", CLR_AMBER_TXT if report.get("enhanced") else CLR_GREEN_TXT,
                         "CLAHE + denoise" if report.get("enhanced") else "not needed"),
        make_label_panel(p3, "3. Grad-CAM ATTENTION", CLR_GREEN_TXT,
                         f"conf {explanation['confidence']*100:.0f}%"),
        make_label_panel(p4, "4. LESION EVIDENCE", CLR_GREEN_TXT,
                         f"MA={evidence['ma_count']} HEM={evidence['hem_count']} EX={evidence['ex_count']}"),
    ]
    row1 = hstack_panels([cv2.resize(p, (int(p.shape[1]*target_h/p.shape[0]), target_h))
                          for p in panels])

    # ---- Row 2: summary card ----
    card_w = row1.shape[1]
    card = np.full((300, card_w, 3), CLR_PANEL_BG, dtype=np.uint8)
    trust = explanation["trust"]
    level_color = (CLR_GREEN_TXT if trust["trust_level"] == "HIGH"
                   else CLR_AMBER_TXT if trust["trust_level"] == "MODERATE"
                   else CLR_RED_TXT)

    # patient info
    cv2.putText(card, f"DRISHTI SCREENING REPORT  |  Patient {patient_id}  |  "
                f"DRISHTI Prototype v1.0", (18, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, CLR_WHITE, 2)

    # grade box
    pred_txt = explanation["predicted_label"]
    (tw, _), _ = cv2.getTextSize(pred_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.85, 2)
    cv2.putText(card, pred_txt, (18, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.85, level_color, 2)

    info_lines = [
        f"AI confidence: {explanation['confidence']*100:.0f}%   |   "
        f"Consistency: {explanation['consistency']['consistency']:.2f} "
        f"({explanation['consistency']['verdict']})",
        f"Evidence: {evidence['ma_count']} microaneurysms | "
        f"{evidence['hem_count']} hemorrhages | {evidence['ex_count']} exudates"
        + ("   ** DME RISK: URGENT **" if evidence['dme_risk'] else ""),
        f"Trust score: {trust['trust_score']:.2f} ({trust['trust_level']})  ->  {trust['route']}",
        f"Recommendation: {result['recommendation']}",
    ]
    for i, line in enumerate(info_lines):
        color = CLR_RED_TXT if ("DME" in line and "RISK" in line) else CLR_WHITE
        cv2.putText(card, line, (18, 135 + i * 34), cv2.FONT_HERSHEY_SIMPLEX,
                    0.58, color, 1, cv2.LINE_AA)

    # trust bar (visual)
    bar_x, bar_y, bar_w, bar_h = card_w - 420, 200, 380, 26
    cv2.rectangle(card, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (60, 60, 60), -1)
    filled = int(bar_w * trust["trust_score"])
    cv2.rectangle(card, (bar_x, bar_y), (bar_x + filled, bar_y + bar_h), level_color, -1)
    cv2.putText(card, f"TRUST {trust['trust_score']:.2f}", (bar_x, bar_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, level_color, 2)
    cv2.putText(card, "Human-in-the-loop: ophthalmologist verifies in <30 s",
                (bar_x, bar_y + 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)

    full = np.vstack([row1, card])
    out = os.path.join(outdir, f"{patient_id}_report.png")
    cv2.imwrite(out, full)
    print(f"\n   [REPORT]  saved -> {out}")
    return out


# ==========================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="path to fundus image")
    ap.add_argument("--id", default="DEMO-001", help="patient id")
    ap.add_argument("--outdir", default=OUT_DIR)
    args = ap.parse_args()
    result = run_full_pipeline(args.image, patient_id=args.id, outdir=args.outdir)
    print("\n" + "=" * 60)
    print(json.dumps({k: v for k, v in result.items() if k != "gradcam"},
                     indent=2, default=str)[:2000])


if __name__ == "__main__":
    main()
