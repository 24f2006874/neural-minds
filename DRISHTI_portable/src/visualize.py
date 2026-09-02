"""
============================================================================
DRISHTI - VISUALIZATION: Clinical result panels for demos & reports
============================================================================
Creates doctor-friendly images:
  * Overlay panel: original retina + all detected evidence marked in colours
  * Multi-step pipeline panel: every module's output side by side
Colour legend (same as our PPT):
  BLUE circle    = optic disc        GREEN lines  = blood vessels
  YELLOW cross   = fovea             CYAN dots    = microaneurysms
  RED patches    = hemorrhages       ORANGE/yellow= hard exudates
============================================================================
"""

import cv2
import numpy as np

# Colour constants (BGR format as OpenCV uses)
CLR_OD = (255, 130, 30)        # blue circle
CLR_FOVEA = (0, 230, 230)      # yellow cross
CLR_VESSEL = (90, 220, 90)     # green
CLR_MA = (255, 255, 0)         # cyan dots
CLR_HEM = (0, 0, 255)          # red
CLR_EX = (0, 140, 255)         # orange
CLR_GREEN_TXT = (60, 190, 60)
CLR_RED_TXT = (50, 50, 230)
CLR_AMBER_TXT = (50, 170, 230)
CLR_WHITE = (255, 255, 255)
CLR_PANEL_BG = (18, 18, 24)    # dark background


def draw_evidence_overlay(img, evidence, title=None):
    """
    Draws ALL detected clinical evidence on top of the retina photo.
    This is the money-shot image for the demo: doctors instantly see WHAT
    the AI found and WHERE - that is explainability in one picture.
    """
    out = img.copy()

    # 1. Blood vessels in green (semi-transparent thick lines)
    vessel_overlay = out.copy()
    vessel_overlay[evidence["vessels"] > 0] = CLR_VESSEL
    out = cv2.addWeighted(vessel_overlay, 0.35, out, 0.65, 0)

    # 2. Hemorrhages - red patches (semi-transparent fill)
    hem_overlay = out.copy()
    hem_overlay[evidence["hem_mask"] > 0] = CLR_HEM
    out = cv2.addWeighted(hem_overlay, 0.45, out, 0.55, 0)

    # 3. Exudates - orange patches
    ex_overlay = out.copy()
    ex_overlay[evidence["ex_mask"] > 0] = CLR_EX
    out = cv2.addWeighted(ex_overlay, 0.45, out, 0.55, 0)

    # 4. Optic disc - blue circle
    ox, oy, r = evidence["optic_disc"]
    cv2.circle(out, (int(ox), int(oy)), int(r), CLR_OD, 2)

    # 5. Fovea - yellow cross
    fx, fy = evidence["fovea"]
    cv2.drawMarker(out, (int(fx), int(fy)), CLR_FOVEA, cv2.MARKER_CROSS, 26, 2)
    cv2.circle(out, (int(fx), int(fy)), 14, CLR_FOVEA, 1)

    # 6. Microaneurysms - cyan rings (small, so rings are clearer than fills)
    for (cx, cy) in evidence["ma_centres"]:
        cv2.circle(out, (cx, cy), 7, CLR_MA, 2)

    # 7. DME danger zone - dashed yellow circle of 1 DD around fovea
    if evidence["dme_risk"]:
        dd = 2 * evidence["optic_disc"][2]
        cv2.circle(out, (int(fx), int(fy)), int(dd), (0, 200, 255), 2)
        cv2.putText(out, "DME RISK ZONE", (int(fx) + int(dd) + 6, int(fy) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 2)

    # 8. Legend box (so anyone can read the image)
    legend_lines = [
        ("OD: optic disc", CLR_OD),
        ("F: fovea", CLR_FOVEA),
        (f"MA: {evidence['ma_count']} microaneurysms", CLR_MA),
        (f"HEM: {evidence['hem_count']} hemorrhages", CLR_HEM),
        (f"EX: {evidence['ex_count']} exudates", CLR_EX),
    ]
    lh = 26
    box_h = lh * len(legend_lines) + 14
    cv2.rectangle(out, (8, 8), (330, 8 + box_h), (0, 0, 0), -1)
    cv2.rectangle(out, (8, 8), (330, 8 + box_h), CLR_WHITE, 1)
    for i, (txt, color) in enumerate(legend_lines):
        cv2.putText(out, txt, (20, 32 + i * lh), cv2.FONT_HERSHEY_SIMPLEX,
                    0.55, color, 1, cv2.LINE_AA)

    if title:
        cv2.rectangle(out, (0, out.shape[0] - 34), (out.shape[1], out.shape[0]), (0, 0, 0), -1)
        cv2.putText(out, title, (10, out.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, CLR_WHITE, 2, cv2.LINE_AA)
    return out


def make_label_panel(img, label, status_color=CLR_WHITE, sublabel=None, target_h=605):
    """Puts a title bar with a status colour above an image panel."""
    bar_h = 54
    scale = target_h / img.shape[0]
    resized = cv2.resize(img, (int(img.shape[1] * scale), target_h)) if scale != 1 else img
    w = resized.shape[1]
    panel = np.full((target_h + bar_h, w, 3), CLR_PANEL_BG, dtype=np.uint8)
    panel[bar_h:, :] = resized
    # colour strip
    panel[0:6, :] = status_color
    cv2.putText(panel, label, (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.72, CLR_WHITE, 2, cv2.LINE_AA)
    if sublabel:
        (tw, _), _ = cv2.getTextSize(sublabel, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.putText(panel, sublabel, (w - tw - 12, 36), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, status_color, 1, cv2.LINE_AA)
    return panel


def hstack_panels(panels, pad=10):
    """Joins panels horizontally with padding (handles different heights)."""
    h = max(p.shape[0] for p in panels)
    parts = []
    for p in panels:
        if p.shape[0] < h:  # pad bottom
            diff = h - p.shape[0]
            p = np.vstack([p, np.full((diff, p.shape[1], 3), CLR_PANEL_BG, dtype=np.uint8)])
        parts.append(p)
        parts.append(np.full((h, pad, 3), CLR_PANEL_BG, dtype=np.uint8))
    return np.hstack(parts[:-1])


def quality_badge(img, report):
    """Stamps the quality score + gate decision onto an image (top-right)."""
    out = img.copy()
    score = report["quality_score"]
    decision = report["decision"]
    color = CLR_GREEN_TXT if decision.startswith("ACCEPT") else (
        CLR_AMBER_TXT if decision == "ENHANCE" else CLR_RED_TXT)
    h, w = out.shape[:2]
    box_w, box_h = 270, 92
    cv2.rectangle(out, (w - box_w - 10, 10), (w - 10, 10 + box_h), (0, 0, 0), -1)
    cv2.rectangle(out, (w - box_w - 10, 10), (w - 10, 10 + box_h), color, 2)
    cv2.putText(out, f"QUALITY: {score:.2f}", (w - box_w + 8, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2, cv2.LINE_AA)
    cv2.putText(out, decision, (w - box_w + 8, 78),
                cv2.FONT_HERSHEY_SIMPLEX, 0.62, color, 2, cv2.LINE_AA)
    return out
