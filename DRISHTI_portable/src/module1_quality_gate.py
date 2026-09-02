"""
============================================================================
DRISHTI - MODULE 1: THE TRUST GATE (Image Quality Assessment + Enhancement)
============================================================================
WHAT THIS MODULE DOES (in plain words):
    A retina photo taken in a village health centre is often blurry, too
    dark, or badly framed. A doctor would refuse to read such a photo.
    Our AI must do the same -> otherwise it will make WRONG predictions
    on bad images and people will lose trust.

    So before ANY analysis, we give every image a "quality report card"
    with 3 marks (like a school report):

        1. FOCUS        - is the image sharp? (can we see tiny blood vessels?)
        2. ILLUMINATION - is the brightness good and even?
        3. FIELD OF VIEW- did the camera capture enough of the retina?

    Then we take ONE of three decisions (this is the "TRUST GATE"):
        ACCEPT  (score > 0.80)  -> send image to Module 2 for analysis
        ENHANCE (score 0.5-0.80)-> fix the image first, then re-check
        REJECT  (score < 0.50)  -> tell the health worker to take a NEW photo,
                                   WITH the specific reason why it failed

MEDICAL BACKGROUND:
    * Fundus photo = photo of the back of the eye (the "retina")
    * CLAHE = Contrast Limited Adaptive Histogram Equalization.
      A famous technique that brightens dark areas of an image locally
      without over-brightening the already-bright areas.
============================================================================
"""

import cv2
import numpy as np


# --------------------------------------------------------------------------
# STEP 0: Find the retina (the useful circular area) inside the photo
# --------------------------------------------------------------------------
def get_retina_mask(img):
    """
    The camera photo is a black square with a bright circle (the retina)
    inside it. We create a binary mask (white = retina, black = background)
    so all our measurements are done ONLY on the retina, not the black area.

    Returns: mask (uint8, 255 = retina, 0 = background)
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Retina pixels are brighter than the black background (threshold = 15)
    _, mask = cv2.threshold(gray, 15, 255, cv2.THRESH_BINARY)

    # Morphological operations = cleaning up the mask:
    #   CLOSE = fill small holes,  OPEN = remove small noise dots
    kernel = np.ones((15, 15), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Keep only the BIGGEST bright region (= the retina itself)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return mask  # nothing found, return as-is
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])  # skip label 0 (bg)
    mask = np.where(labels == largest, 255, 0).astype(np.uint8)
    return mask


# --------------------------------------------------------------------------
# QUALITY METRIC 1: FOCUS (sharpness)
# --------------------------------------------------------------------------
def focus_score(img, mask):
    """
    BLURRY image = we cannot see microaneurysms (tiny red dots that are the
    EARLIEST sign of diabetes). A blurry image is medically USELESS.

    How we measure sharpness:
      * Laplacian filter detects edges (vessel walls). In a sharp image
        there are many strong edges -> high variance of the Laplacian.
      * Tenengrad (Sobel gradients) measures edge energy similarly.
    We combine both and squash the result into 0..1.

    IMPORTANT: we measure well INSIDE the retina (eroded mask). Otherwise a
    sharp eyelid edge or the black photo border would falsely raise the
    score of an otherwise blurry image.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)

    inner = cv2.erode(mask, np.ones((25, 25), np.uint8))   # away from borders
    if inner.sum() == 0:
        inner = mask

    # --- Laplacian variance (classic blur detector) ---
    lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
    lap_var = lap[inner > 0].var()

    # --- Tenengrad edge energy ---
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    tenengrad = np.mean((gx ** 2 + gy ** 2)[inner > 0])

    # Squash to 0..1 (higher = sharper). Constants tuned for fundus photos.
    s1 = 1.0 - np.exp(-lap_var / 100.0)
    s2 = 1.0 - np.exp(-tenengrad / 2200.0)
    score = float(0.6 * s1 + 0.4 * s2)
    # Hard cap: if there is essentially NO edge energy, the image is blurred
    # (or completely featureless) - no enhancement can ever rescue it.
    if lap_var < 12:
        score = min(score, 0.30)
    return score, float(lap_var)


# --------------------------------------------------------------------------
# QUALITY METRIC 2: ILLUMINATION (brightness + evenness)
# --------------------------------------------------------------------------
def illumination_score(img, mask):
    """
    Too dark -> we miss lesions.  Too bright -> everything is washed out.
    Uneven lighting (common with cheap handheld cameras) -> one side of the
    photo looks different from the other side.

    We split the retina into an 8x8 grid (like a chess board) and check:
      * the average brightness of the whole retina (must be moderate)
      * how different the 64 grid cells are (must be similar = "uniform")
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # --- Average brightness inside the retina only ---
    mean_bright = float(gray[mask > 0].mean())

    # Ideal brightness ~ 60..200. Outside this range, penalise gradually.
    if 60 <= mean_bright <= 200:
        bright_s = 1.0
    elif mean_bright < 60:
        bright_s = max(0.0, mean_bright / 60.0)      # too dark
    else:
        bright_s = max(0.0, (255.0 - mean_bright) / 55.0)  # too bright

    # --- Uniformity: 8x8 grid brightness comparison ---
    cell_h, cell_w = h // 8, w // 8
    cell_means = []
    for i in range(8):
        for j in range(8):
            cell = gray[i * cell_h:(i + 1) * cell_h, j * cell_w:(j + 1) * cell_w]
            cell_mask = mask[i * cell_h:(i + 1) * cell_h, j * cell_w:(j + 1) * cell_w]
            if cell_mask.mean() > 0.4:  # only cells that are mostly retina
                cell_means.append(cell[cell_mask > 0].mean())
    if len(cell_means) < 4:
        uniform_s = 0.0   # we could not even measure -> suspicious image
    else:
        spread = float(np.std(cell_means))
        uniform_s = float(np.exp(-spread / 45.0))  # low spread -> high score

    return float(0.55 * bright_s + 0.45 * uniform_s), mean_bright


# --------------------------------------------------------------------------
# QUALITY METRIC 3: FIELD OF VIEW (did we capture enough retina?)
# --------------------------------------------------------------------------
def fov_score(img, mask):
    """
    If only a tiny sliver of retina was captured, we cannot grade DR.
    We check:
      * coverage: how much of the photo frame is retina (healthy fundus
        photos cover ~75-90% of the frame)
      * fill ratio: retina area vs its own bounding box. A healthy retina
        is one big round/oval blob (fill ~0.75). An eyelid or eyelash
        cutting into the photo leaves the bounding box mostly empty.
      * shape: how round the blob is
    """
    coverage = float((mask > 0).mean())

    # Coverage score: full marks at 0.75+, zero below 0.40
    cov_s = float(np.clip((coverage - 0.40) / (0.75 - 0.40), 0.0, 1.0))

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    shape_s, fill_s = 0.5, 0.5
    if cnts:
        c = max(cnts, key=cv2.contourArea)
        area = cv2.contourArea(c)
        (cx, cy), radius = cv2.minEnclosingCircle(c)
        circle_area = np.pi * radius * radius
        shape_s = float(area / circle_area) if circle_area > 0 else 0.5
        x, y, bw, bh = cv2.boundingRect(c)
        fill_s = float(np.clip(area / (bw * bh + 1e-6) / 0.75, 0.0, 1.0))

    score = float(0.45 * cov_s + 0.30 * fill_s + 0.25 * min(1.0, shape_s / 0.85))
    return score, coverage


# --------------------------------------------------------------------------
# THE COMPLETE QUALITY REPORT (all 3 metrics -> one decision)
# --------------------------------------------------------------------------
def assess_quality(img):
    """
    Runs all 3 checks and returns a full quality report as a dictionary.
    Final score is a weighted average:  focus 40%, illumination 30%, FOV 30%.
    """
    mask = get_retina_mask(img)

    focus, lap_var = focus_score(img, mask)
    illum, mean_bright = illumination_score(img, mask)
    fov, coverage = fov_score(img, mask)

    score = float(0.40 * focus + 0.30 * illum + 0.30 * fov)

    # ---- TRUST GATE DECISION ----
    if score >= 0.80:
        decision, reason = "ACCEPT", "Image quality is good. Proceed to analysis."
    elif score >= 0.50:
        decision, reason = "ENHANCE", "Borderline quality. Applying enhancement and re-checking."
    else:
        # Build a SPECIFIC recapture message for the health worker:
        reasons = []
        if focus < 0.35:
            reasons.append("image too blurry - ask patient to hold still and refocus")
        if illum < 0.35:
            reasons.append("bad lighting - check camera flash / room lighting")
        if fov < 0.35:
            reasons.append("retina not fully captured - realign camera closer to pupil")
        if not reasons:
            reasons.append("overall quality too low - retake the photo")
        decision = "REJECT"
        reason = "RECAPTURE NEEDED: " + "; ".join(reasons)

    return {
        "quality_score": round(score, 3),
        "focus": round(focus, 3),
        "illumination": round(illum, 3),
        "field_of_view": round(fov, 3),
        "laplacian_variance": round(lap_var, 1),
        "mean_brightness": round(mean_bright, 1),
        "retina_coverage": round(coverage, 3),
        "decision": decision,
        "reason": reason,
        "mask": mask,
    }


# --------------------------------------------------------------------------
# ENHANCEMENT: rescue borderline images (CLAHE + denoising)
# --------------------------------------------------------------------------
def enhance_image(img):
    """
    For "borderline" images we apply 3 rescue steps (all from our PPT):
      1. CLAHE on the L (lightness) channel -> local contrast boost
      2. Non-local means denoising -> removes camera sensor noise
      3. Gentle gamma correction if image was too dark/bright
    Returns the enhanced image.
    """
    # --- Step 1: CLAHE on lightness channel of LAB colour space ---
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))  # 8x8 tiles
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.cvtColor(cv2.merge([l_channel, a_channel, b_channel]), cv2.COLOR_LAB2BGR)

    # --- Step 2: Non-local means denoising (keeps edges, removes noise) ---
    enhanced = cv2.fastNlMeansDenoisingColored(enhanced, None, 5, 5, 7, 21)

    # --- Step 3: gamma correction for very dark images ---
    gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    mean_bright = float(gray[gray > 15].mean()) if (gray > 15).any() else 0.0
    if mean_bright < 70:
        gamma = 0.6   # brighten dark images (gamma < 1 brightens)
        table = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, table)
    elif mean_bright > 190:
        gamma = 1.4   # darken over-exposed images
        table = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, table)

    return enhanced


def quality_gate(img, verbose=True):
    """
    THE MAIN FUNCTION of Module 1. Give it any fundus image.
    Returns: (decision, final_image, quality_report)

    Logic:
        1. Measure quality.
        2. If ENHANCE -> enhance, then measure AGAIN (did we rescue it?)
        3. If still < 0.5 after enhancement -> REJECT (honest system!)
    """
    report = assess_quality(img)
    decision = report["decision"]
    final_img = img

    if decision == "ENHANCE":
        enhanced = enhance_image(img)
        report2 = assess_quality(enhanced)
        if verbose:
            print(f"   [TRUST GATE] borderline ({report['quality_score']:.2f}) "
                  f"-> enhanced -> new score {report2['quality_score']:.2f}")
        # Enhancement can fix brightness, but NEVER blur (information lost).
        # So we require BOTH: decent overall score AND recoverable focus.
        if report2["quality_score"] >= 0.62 and report2["focus"] >= 0.30:
            decision, final_img, report = "ACCEPT_AFTER_ENHANCE", enhanced, report2
            report["decision"] = decision
            report["enhanced"] = True
        else:
            why_blur = "" if report2["focus"] >= 0.30 else " image is too blurry to enhance -"
            decision, report = "REJECT", report
            report["decision"] = "REJECT"
            report["reason"] = (f"RECAPTURE NEEDED:{why_blur} enhancement could not "
                                "rescue this image (" + report["reason"].lower() + ")")

    if verbose:
        print(f"   [TRUST GATE] decision = {decision}  |  score = {report['quality_score']:.2f}")
    return decision, final_img, report
