"""
============================================================================
DRISHTI - MODULE 2: CLINICAL EVIDENCE ENGINE (Lesion & Structure Detection)
============================================================================
WHAT THIS MODULE DOES (in plain words):
    This module acts like a detective. It finds the actual MEDICAL EVIDENCE
    inside the retina photo. Each evidence type maps to how real
    ophthalmologists diagnose diabetic retinopathy (DR):

    ANATOMY (normal structures - our "landmarks"):
      * Optic Disc (OD)   = the bright circular "blind spot" where the
                           optic nerve enters the eye. Our reference point.
      * Fovea             = the centre of vision (darkest small spot),
                           ~2.5 disc-diameters away from the optic disc.
      * Blood vessels     = the branching red lines. We detect them so we
                           don't confuse them with lesions.

    LESIONS (the actual signs of disease - our "evidence"):
      * Microaneurysms(MA)= tiny red dots (10-100 px). EARLIEST DR sign.
      * Hemorrhages (HEM) = larger dark red patches = leaked blood.
      * Hard Exudates (EX)= yellow-white waxy deposits = protein leakage.

    URGENT FLAG:
      * If exudates come within 1 disc-diameter of the fovea, the macula
        (centre of vision) is threatened -> DME risk -> URGENT referral.
        (DME = Diabetic Macular Edema, the #1 cause of DR vision loss)

    DETECTION TECHNIQUES (classical, no training data needed):
      * BLACK-HAT transform = (closing of image) - (image).
        Highlights structures DARKER and SMALLER than the kernel.
        -> used for microaneurysms & hemorrhages (dark red lesions)
      * WHITE TOP-HAT transform = (image) - (opening of image).
        Highlights structures BRIGHTER and SMALLER than the kernel.
        -> used for hard exudates (bright yellow lesions)
      * SATO tubular filter = highlights tube-like shapes (blood vessels)
============================================================================
"""

import cv2
import numpy as np
from skimage.filters import sato

# Tunable clinical constants (pixels, for ~700x605 images)
MA_AREA_MIN, MA_AREA_MAX = 4, 120        # microaneurysm size range
HEM_AREA_MIN = 120                       # hemorrhages are bigger than MAs
EX_AREA_MIN = 25                         # smallest visible exudate
FOVEA_SEARCH_MIN_DD, FOVEA_SEARCH_MAX_DD = 1.6, 3.0   # fovea distance range (disc diameters)


# ==========================================================================
# PART A: NORMAL ANATOMY (landmarks)
# ==========================================================================

def segment_vessels(img, mask):
    """
    Blood vessel segmentation using the SATO tubular filter.
    Vessels show best in the GREEN channel (blood absorbs green light).
    Returns: binary vessel mask (255 = vessel).
    """
    green = img[:, :, 1].copy()
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    green = clahe.apply(green)

    vesselness = sato(green, sigmas=range(1, 6), black_ridges=True)
    v = cv2.normalize(vesselness, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # ADAPTIVE threshold: keep roughly the top 10% of vesselness inside the
    # retina (vessels medically occupy 8-14% of the retina area). This makes
    # the detector work across different cameras and brightness levels.
    vals = v[mask > 0]
    thr = float(np.clip(np.percentile(vals, 90.0), 25, 70))
    _, vessels = cv2.threshold(v, thr, 255, cv2.THRESH_BINARY)
    vessels = cv2.bitwise_and(vessels, vessels, mask=mask)

    # Clean: close small gaps, then delete tiny fragments
    kernel = np.ones((3, 3), np.uint8)
    vessels = cv2.morphologyEx(vessels, cv2.MORPH_CLOSE, kernel)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(vessels, connectivity=8)
    clean = np.zeros_like(vessels)
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= 40:
            clean[labels == i] = 255
    return clean


def detect_optic_disc(img, mask, vessels):
    """
    The Optic Disc is the BRIGHTEST big round region of the retina.
      1. Remove vessels from the lightness channel (they add brightness)
      2. Big morphological closing merges the disc into one bright blob
      3. Pick the best blob: bright + round + large + not at the edge
      4. Refine the radius from the blob's own pixels (not the bounding circle)
    Returns: (center_x, center_y, radius)
    """
    h, w = mask.shape
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    lightness = lab[:, :, 0].astype(np.float32)

    # Remove vessels so they don't confuse the brightness search
    inpainted = lightness.copy()
    vessel_dilated = cv2.dilate(vessels, np.ones((11, 11), np.uint8))
    inpainted[vessel_dilated > 0] = 0

    closed = cv2.morphologyEx(np.clip(inpainted, 0, 255).astype(np.uint8),
                              cv2.MORPH_CLOSE, np.ones((35, 35), np.uint8))
    closed = cv2.GaussianBlur(closed, (25, 25), 0)
    closed = cv2.bitwise_and(closed, closed, mask=mask)

    # Top 2% brightest pixels = optic disc candidates
    retina_vals = closed[mask > 0]
    thresh = np.percentile(retina_vals, 98) if retina_vals.size else 200
    _, candidates = cv2.threshold(closed, max(float(thresh), 60), 255, cv2.THRESH_BINARY)

    cnts, _ = cv2.findContours(candidates, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best, best_score = None, -1e9
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 400:
            continue
        (cx, cy), radius = cv2.minEnclosingCircle(c)
        circularity = area / (np.pi * radius * radius + 1e-6)      # 1.0 = perfect circle
        # discs never touch the image border - penalise edge positions
        edge_ok = min(cx, w - cx) / (0.22 * w) * min(cy, h - cy) / (0.22 * h)
        edge_ok = min(edge_ok, 1.0)
        brightness = closed[int(np.clip(cy, 0, h - 1)), int(np.clip(cx, 0, w - 1))] / 255.0
        score = np.sqrt(area) * circularity * edge_ok * brightness
        if score > best_score:
            best_score, best = score, c

    if best is None:
        (_, _, maxLoc, _) = cv2.minMaxLoc(closed, mask)
        return int(maxLoc[0]), int(maxLoc[1]), float(0.07 * min(h, w))

    # Refine: centre = blob centroid; radius = median distance of blob pixels
    M = cv2.moments(best)
    cx, cy = M["m10"] / M["m00"], M["m01"] / M["m00"]
    pts = best.reshape(-1, 2).astype(np.float32)
    dists = np.sqrt((pts[:, 0] - cx) ** 2 + (pts[:, 1] - cy) ** 2)
    radius = float(np.median(dists)) * 1.35   # the candidate blob is a bit small
    radius = float(np.clip(radius, 0.055 * min(h, w), 0.10 * min(h, w)))
    return int(cx), int(cy), radius


def find_fovea(img, od_center, disc_radius, mask, vessels):
    """
    The fovea (centre of vision) is a DARK small area ~2.5 disc-diameters
    (DD) from the optic disc, towards the image centre.
    We search a fan of positions 1.6-3.0 DD from the disc, and pick the
    DARKEST small patch that is inside the retina and away from vessels.
    Returns: (fovea_x, fovea_y)
    """
    ox, oy = od_center
    h, w = mask.shape
    dd = 2 * disc_radius                       # 1 disc-diameter in pixels

    # Direction from optic disc towards the image centre (macula lies that way)
    dx, dy = w / 2 - ox, h / 2 - oy
    norm = np.sqrt(dx * dx + dy * dy) + 1e-6
    dx, dy = dx / norm, dy / norm

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray).astype(np.float32)

    # Only look INSIDE the retina, away from its border (erode the mask)
    eroded = cv2.erode(mask, np.ones((41, 41), np.uint8))

    best, best_dark = None, np.inf
    for dist_dd in np.arange(FOVEA_SEARCH_MIN_DD, FOVEA_SEARCH_MAX_DD, 0.1):
        for angle_deg in np.arange(-30, 31, 5):
            a = np.deg2rad(angle_deg)
            ca, sa = np.cos(a), np.sin(a)
            px = int(ox + (dx * ca - dy * sa) * dist_dd * dd)
            py = int(oy + (dx * sa + dy * ca) * dist_dd * dd)
            if not (0 <= px < w and 0 <= py < h) or eroded[py, px] == 0:
                continue
            win = 14
            y1, y2 = max(0, py - win), min(h, py + win)
            x1, x2 = max(0, px - win), min(w, px + win)
            patch = gray[y1:y2, x1:x2]
            pmask = eroded[y1:y2, x1:x2]
            if pmask.mean() < 0.6:            # patch must be mostly valid retina
                continue
            darkness = patch[pmask > 0].mean()
            # penalise vessel-covered patches (fovea is avascular)
            vpatch = vessels[y1:y2, x1:x2]
            darkness += 30.0 * (vpatch > 0).mean()
            if darkness < best_dark:
                best_dark, best = darkness, (px, py)

    if best is None:      # absolute fallback: textbook position
        best = (int(ox + dx * 2.5 * dd), int(oy + dy * 2.5 * dd))
    return best


# ==========================================================================
# PART B: LESION DETECTION (the medical evidence)
# ==========================================================================

def detect_microaneurysms(img, mask, vessels, od_center, disc_radius):
    """
    Microaneurysms = TINY dark red dots (the earliest DR sign).
    Recipe:
      1. Green channel + CLAHE (red lesions look DARK in green light)
      2. BLACK-HAT transform with a disk kernel bigger than an MA
         -> small dark dots "light up" in the residual image
      3. Threshold, then DELETE all vessel pixels (main false positive!)
      4. Keep blobs of clinical MA size (4-120 px) that are roughly round
    Returns: (mask_of_MAs, list_of_MA_centres)
    """
    green = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    green = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(green)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    blackhat = cv2.morphologyEx(green, cv2.MORPH_BLACKHAT, kernel)

    # POSTERIOR POLE: clinically, microaneurysms appear in the central retina
    # (within ~3.5 disc-diameters of the optic disc), not at the periphery
    # where camera vignetting and film artifacts create false positives.
    h, w = mask.shape
    pole = np.zeros((h, w), np.uint8)
    ox, oy, _ = od_center
    cv2.circle(pole, (int(ox), int(oy)), int(3.5 * 2 * disc_radius), 255, -1)
    inner = cv2.erode(mask, np.ones((51, 51), np.uint8))
    pole = cv2.bitwise_and(pole, pole, mask=inner)

    # NOISE-ADAPTIVE threshold: estimate THIS image's own noise floor
    # (median + 3 x robust std-dev of the black-hat response), so a grainy
    # photo needs a much stronger signal to count as a microaneurysm.
    vals = blackhat[pole > 0]
    if vals.size < 100:
        return np.zeros_like(mask), []
    med = np.median(vals)
    mad = np.median(np.abs(vals - med)) * 1.4826   # robust sigma estimate
    thr = float(np.clip(med + 3.0 * mad, 16, 45))
    _, ma_mask = cv2.threshold(blackhat, thr, 255, cv2.THRESH_BINARY)
    ma_mask = cv2.bitwise_and(ma_mask, ma_mask, mask=pole)

    # DELETE vessels (dilated - a vessel is NOT a microaneurysm)
    vessels_big = cv2.dilate(vessels, np.ones((7, 7), np.uint8))
    ma_mask = cv2.bitwise_and(ma_mask, cv2.bitwise_not(vessels_big))

    # DELETE the optic disc area (its edge creates false positives)
    cv2.circle(ma_mask, (int(ox), int(oy)), int(disc_radius * 1.2), 0, -1)

    # Size + shape filter
    num, labels, stats, centroids = cv2.connectedComponentsWithStats(ma_mask, connectivity=8)
    final = np.zeros_like(ma_mask)
    centres = []
    for i in range(1, num):
        area = stats[i, cv2.CC_STAT_AREA]
        if not (5 <= area <= MA_AREA_MAX):
            continue
        cx, cy = centroids[i]
        bw, bh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        aspect = bw / max(bh, 1)
        if not (0.35 <= aspect <= 2.8):        # roughly round, not a line
            continue
        final[labels == i] = 255
        centres.append((int(cx), int(cy)))
    return final, centres


def detect_hemorrhages(img, mask, vessels, od_center, disc_radius, ma_mask):
    """
    Hemorrhages = LARGER dark red patches (leaked blood).
    Same black-hat idea but with a BIG kernel (25 px) so only wide dark
    blobs survive; microaneurysm blobs are subtracted to avoid double count.
    Returns: (mask, list_of_centres)
    """
    green = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    green = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(green)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    blackhat = cv2.morphologyEx(green, cv2.MORPH_BLACKHAT, kernel)

    _, hem_mask = cv2.threshold(blackhat, 20, 255, cv2.THRESH_BINARY)
    hem_mask = cv2.bitwise_and(hem_mask, hem_mask, mask=mask)

    # Remove vessels (strongly dilated) and the optic disc region
    vessels_big = cv2.dilate(vessels, np.ones((13, 13), np.uint8))
    hem_mask = cv2.bitwise_and(hem_mask, cv2.bitwise_not(vessels_big))
    ox, oy, _ = od_center
    cv2.circle(hem_mask, (int(ox), int(oy)), int(disc_radius * 1.3), 0, -1)

    # Remove microaneurysms (already counted separately)
    hem_mask = cv2.bitwise_and(hem_mask,
                               cv2.bitwise_not(cv2.dilate(ma_mask, np.ones((9, 9), np.uint8))))

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(hem_mask, connectivity=8)
    final = np.zeros_like(hem_mask)
    centres = []
    for i in range(1, num):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < HEM_AREA_MIN:
            continue
        final[labels == i] = 255
        centres.append((int(centroids[i][0]), int(centroids[i][1])))
    return final, centres


def detect_exudates(img, mask, od_center, disc_radius, vessels):
    """
    Hard exudates = YELLOW-WHITE waxy patches (protein leakage).
    Recipe (robust across cameras - we do NOT rely on absolute colour,
    because whole retinas can look yellowish):
      1. Lightness channel L (exudates are BRIGHT)
      2. WHITE TOP-HAT (image - opening) -> only small BRIGHT spots survive
      3. Yellow confirmation via the LAB b* channel (relative percentile!)
      4. REMOVE the optic disc (also bright & yellowish, but NOT an exudate!)
    Returns: (mask, list_of_centres)
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    lightness, _, b_ch = cv2.split(lab)

    # White top-hat: bright structures smaller than a 15px disk
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    tophat = cv2.morphologyEx(lightness, cv2.MORPH_TOPHAT, kernel)
    _, candidates = cv2.threshold(tophat, 18, 255, cv2.THRESH_BINARY)

    # Yellow confirmation: b* must be above the image's OWN 45th percentile
    # (relative test - immune to overall yellow/orange camera colour cast)
    b_ref = np.percentile(b_ch[mask > 0], 45) if (mask > 0).any() else 128
    yellow_ok = (b_ch >= b_ref).astype(np.uint8) * 255
    candidates = cv2.bitwise_and(candidates, yellow_ok)

    # Close gaps inside exudate clusters, keep inside retina
    candidates = cv2.morphologyEx(candidates, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    candidates = cv2.bitwise_and(candidates, candidates, mask=mask)

    # REMOVE the optic disc region - critical false-positive source!
    ox, oy, _ = od_center
    cv2.circle(candidates, (int(ox), int(oy)), int(disc_radius * 1.3), 0, -1)
    # Remove vessels
    candidates = cv2.bitwise_and(candidates,
                                 cv2.bitwise_not(cv2.dilate(vessels, np.ones((9, 9), np.uint8))))

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(candidates, connectivity=8)
    final = np.zeros_like(candidates)
    centres = []
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] < EX_AREA_MIN:
            continue
        final[labels == i] = 255
        centres.append((int(centroids[i][0]), int(centroids[i][1])))
    return final, centres


def dme_risk_flag(exudate_centres, fovea, disc_radius):
    """
    DME (Diabetic Macular Edema) risk = exudates close to the fovea.
    Clinical rule: hard exudates within 1 disc-diameter (1 DD) of the fovea
    centre -> macula threatened -> URGENT referral.
    """
    if not exudate_centres:
        return False, None, "No exudates detected -> no DME risk flag"
    fx, fy = fovea
    dd = 2 * disc_radius
    dists = [np.hypot(cx - fx, cy - fy) for (cx, cy) in exudate_centres]
    dmin = min(dists)
    if dmin < 1.0 * dd:
        return True, dmin / dd, (f"URGENT: exudate within {dmin/dd:.2f} DD of fovea -> "
                                 "possible DME. Refer to ophthalmologist immediately.")
    return False, dmin / dd, (f"Closest exudate is {dmin/dd:.2f} DD from fovea (>1 DD) "
                              "-> no immediate DME flag")


# ==========================================================================
# THE COMPLETE EVIDENCE ENGINE
# ==========================================================================
def analyze(img, mask, verbose=True):
    """
    Runs the full evidence engine on ONE (already quality-checked) image.
    Returns the "evidence package" used by Modules 3 & 4 for grading
    and explainability.
    """
    if verbose:
        print("   [EVIDENCE] segmenting vessels (Sato filter)...")
    vessels = segment_vessels(img, mask)
    vessel_density = float((vessels > 0).sum() / max((mask > 0).sum(), 1))

    if verbose:
        print("   [EVIDENCE] locating optic disc + fovea...")
    od_center = detect_optic_disc(img, mask, vessels)          # (x, y, radius)
    fovea = find_fovea(img, (od_center[0], od_center[1]), od_center[2], mask, vessels)

    if verbose:
        print("   [EVIDENCE] hunting lesions: MAs / hemorrhages / exudates...")
    ma_mask, ma_centres = detect_microaneurysms(img, mask, vessels, od_center, od_center[2])
    hem_mask, hem_centres = detect_hemorrhages(img, mask, vessels, od_center, od_center[2], ma_mask)
    ex_mask, ex_centres = detect_exudates(img, mask, od_center, od_center[2], vessels)
    dme_risk, dme_dist, dme_msg = dme_risk_flag(ex_centres, fovea, od_center[2])

    if verbose:
        print(f"   [EVIDENCE] OD=({od_center[0]},{od_center[1]},r={od_center[2]:.0f}) "
              f"fovea={fovea} | MAs={len(ma_centres)} hemorrhages={len(hem_centres)} "
              f"exudates={len(ex_centres)} DME risk={dme_risk}")

    return {
        "vessels": vessels,
        "vessel_density": round(vessel_density, 4),
        "optic_disc": od_center,               # (x, y, radius)
        "fovea": fovea,                        # (x, y)
        "ma_mask": ma_mask, "ma_centres": ma_centres, "ma_count": len(ma_centres),
        "hem_mask": hem_mask, "hem_centres": hem_centres, "hem_count": len(hem_centres),
        "ex_mask": ex_mask, "ex_centres": ex_centres, "ex_count": len(ex_centres),
        "exudate_area_px": int((ex_mask > 0).sum()),
        "hemorrhage_area_px": int((hem_mask > 0).sum()),
        "dme_risk": bool(dme_risk),
        "dme_distance_dd": (round(dme_dist, 2) if dme_dist is not None else None),
        "dme_message": dme_msg,
    }
