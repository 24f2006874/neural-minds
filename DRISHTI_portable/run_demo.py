"""
============================================================================
DRISHTI - DEMO RUNNER (Modules 1 + 2)
============================================================================
Runs the Trust Gate + Evidence Engine on 4 showcase images:
  1. A NORMAL retina            -> should be ACCEPTED, no lesions found
  2. A BACKGROUND DR retina     -> should be ACCEPTED, lesions found
  3. A PROLIFERATIVE DR retina  -> should be ACCEPTED, many lesions found
  4. A DELIBERATELY RUINED image-> should be REJECTED with a clear reason
     (simulates a bad village camera photo: blurry + dark + half-framed)

Outputs go to  drishti/results/
============================================================================
"""
import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
import module1_quality_gate as m1
import module2_evidence_engine as m2
from visualize import (draw_evidence_overlay, make_label_panel, hstack_panels,
                       quality_badge, CLR_GREEN_TXT, CLR_RED_TXT, CLR_AMBER_TXT)

DATA = os.path.join(os.path.dirname(__file__), "data", "stare_images")
OUT = os.path.join(os.path.dirname(__file__), "results")

# The 4 demo cases (STARE image id, human label)
DEMO_CASES = [
    ("im0032.png", "NORMAL RETINA (doctor: Normal)"),
    ("im0001.png", "DR CASE (doctor: Background Diabetic Retinopathy)"),
    ("im0345.png", "SEVERE DR (doctor: Proliferative Diabetic Retinopathy)"),
]


def make_bad_field_image(img):
    """Simulates a poor village-camera photo: blur + darkness + bad framing."""
    bad = cv2.GaussianBlur(img, (25, 25), 9)                 # camera shake blur
    bad = (bad * 0.42).astype(np.uint8)                      # bad flash (dark)
    bad[: int(bad.shape[0] * 0.28), :] = 0                   # eyelid half-covers
    return bad


def run_case(name, label, save_prefix, results_dir):
    print(f"\n{'='*70}\nCASE: {label}  [{name}]\n{'='*70}")
    img = cv2.imread(os.path.join(DATA, name))
    assert img is not None, f"could not read {name}"

    # ---- MODULE 1: TRUST GATE ----
    print(" MODULE 1 - Quality Gate:")
    decision, final_img, report = m1.quality_gate(img)
    if decision == "REJECT":
        print(f"   [TRUST GATE] *** REJECTED *** {report['reason']}")
        rejected = quality_badge(img, report)
        panel = make_label_panel(rejected, "MODULE 1: TRUST GATE -> REJECT",
                                 CLR_RED_TXT, f"score {report['quality_score']:.2f}")
        cv2.imwrite(os.path.join(results_dir, f"{save_prefix}_rejected.png"), panel)
        return None

    # ---- MODULE 2: EVIDENCE ENGINE ----
    print(" MODULE 2 - Evidence Engine:")
    evidence = m2.analyze(final_img, report["mask"])

    # ---- VISUAL OUTPUTS ----
    original = quality_badge(img, report)
    tagged = draw_evidence_overlay(final_img, evidence,
                                   title=f"DRISHTI EVIDENCE MAP | {label}")

    panels = [
        make_label_panel(original, "MODULE 1: TRUST GATE",
                         CLR_GREEN_TXT if not report.get("enhanced") else CLR_AMBER_TXT,
                         f"score {report['quality_score']:.2f} {decision}"),
        make_label_panel(cv2.cvtColor(report["mask"], cv2.COLOR_GRAY2BGR),
                         "MODULE 1b: RETINA MASK", CLR_GREEN_TXT, "coverage "
                         f"{report['retina_coverage']*100:.0f}%"),
        make_label_panel(vessels_pretty(final_img, evidence),
                         "MODULE 2: VESSELS", CLR_GREEN_TXT,
                         f"density {evidence['vessel_density']*100:.1f}%"),
        make_label_panel(tagged, "MODULE 2: EVIDENCE MAP", CLR_GREEN_TXT,
                         f"MA={evidence['ma_count']} HEM={evidence['hem_count']} EX={evidence['ex_count']}"),
    ]
    full = hstack_panels(panels)
    cv2.imwrite(os.path.join(results_dir, f"{save_prefix}_pipeline.png"), full)
    cv2.imwrite(os.path.join(results_dir, f"{save_prefix}_evidence.png"), tagged)

    print(f"   -> saved {save_prefix}_pipeline.png, {save_prefix}_evidence.png")
    return evidence


def vessels_pretty(img, evidence):
    """Vessel map on black background - looks striking in demos."""
    canvas = np.zeros_like(img)
    canvas[evidence["vessels"] > 0] = (90, 220, 90)
    # faint original underneath for context
    faint = (img * 0.18).astype(np.uint8)
    return cv2.add(canvas, faint)


def main():
    os.makedirs(OUT, exist_ok=True)
    summaries = []
    for name, label in DEMO_CASES:
        prefix = name.split(".")[0]
        ev = run_case(name, label, prefix, OUT)
        if ev:
            summaries.append((label, ev))

    # ---- The bad-field image (Trust Gate rejection demo) ----
    print(f"\n{'='*70}\nCASE: BAD FIELD PHOTO (simulated village camera)\n{'='*70}")
    img = cv2.imread(os.path.join(DATA, "im0001.png"))
    bad = make_bad_field_image(img)
    cv2.imwrite(os.path.join(OUT, "bad_field_sample.png"), bad)
    run_case_from_array(bad, "BAD FIELD PHOTO (simulated)", "badfield", OUT)

    # ---- Summary table ----
    print(f"\n{'='*70}\nSUMMARY (lesions found by the Evidence Engine)\n{'='*70}")
    print(f"{'Case':<52}{'MAs':>6}{'HEM':>6}{'EX':>6}{'DME':>6}")
    print("-" * 76)
    for label, ev in summaries:
        print(f"{label:<52}{ev['ma_count']:>6}{ev['hem_count']:>6}"
              f"{ev['ex_count']:>6}{('YES' if ev['dme_risk'] else 'no'):>6}")
    print("\nAll outputs saved in drishti/results/")


def run_case_from_array(img, label, save_prefix, results_dir):
    print(" MODULE 1 - Quality Gate:")
    decision, final_img, report = m1.quality_gate(img)
    if decision == "REJECT":
        print(f"   [TRUST GATE] *** REJECTED *** {report['reason']}")
        rejected = quality_badge(img, report)
        panel = make_label_panel(rejected, "MODULE 1: TRUST GATE -> REJECT",
                                 CLR_RED_TXT, f"score {report['quality_score']:.2f}")
        cv2.imwrite(os.path.join(results_dir, f"{save_prefix}_rejected.png"), panel)
    else:
        print("   (unexpected - this degraded image should have been rejected!)")


if __name__ == "__main__":
    main()
