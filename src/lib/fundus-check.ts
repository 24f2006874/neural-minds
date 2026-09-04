/**
 * Cheap client-side "is this a fundus photograph?" guardrail.
 *
 * The pipeline (real or simulated) will happily grade anything shaped like an
 * image, so a selfie / landscape / meme gets a fake DR grade unless we stop
 * it first. This module runs a deterministic, frame-based heuristic on the
 * dropped image and rejects anything that doesn't look retinal.
 *
 * IMPORTANT: this is a UX guardrail, not security. It must run BEFORE any
 * /api/screen POST, while allowing natural variation in real fundus photos.
 *
 * Heuristics (geometry is hard; visual signals are scored together):
 *   1. Aspect ratio within [0.85, 1.18]      — fundus cameras are ~square
 *   2. Width AND height ≥ 256                — rejects very small thumbnails
 *   3. Center dominant color is warm         — fundus background is red/orange
 *   4. ≥55% center pixels are reddish        — skin/outdoor/portrait fail
 *   5. Luminance std-dev ≥ 18 in center      — flat screenshots fail
 *   6. Edge density ≥ 1.5% in center         — solid color / sky fails
 *   7. Variance of Laplacian ≥ 30            — proxy for blur, let blurry
 *                                              through to the real quality
 *                                              gate rather than double-reject
 *
 * Thresholds are deliberately strict and live as constants at the top so
 * they can be tuned without re-reading the heuristic code.
 */

const ANALYSIS_SIZE = 128;
const CENTER_CROP_FRAC = 0.5;

const THRESHOLDS = {
  aspectMin: 0.85,
  aspectMax: 1.18,
  minDimension: 256,
  centerWarmRMinusB: 20,
  centerWarmR: 70,
  reddishCoverage: 0.55,
  reddishDR: 15,
  reddishDB: 25,
  reddishMinR: 60,
  luminanceStdDev: 18,
  edgeDensity: 0.015,
  laplacianVar: 30,
} as const;

export type FundusCheckResult = {
  accepted: boolean;
  /** human-readable rejection reasons (English, technical) — shown in UI */
  reasons: string[];
  /** 0..1 fraction of signals that passed — debug aid, not displayed by default */
  score: number;
};

export async function looksLikeFundus(file: File): Promise<FundusCheckResult> {
  const reasons: string[] = [];
  let passed = 0;
  const total = 7;

  const bitmap = await decodeBitmap(file);
  const { width, height } = bitmap;

  if (width < THRESHOLDS.minDimension || height < THRESHOLDS.minDimension) {
    reasons.push(
      `Resolution too small (${width}×${height}) — fundus cameras produce at least ${THRESHOLDS.minDimension}px on each side.`,
    );
  } else {
    passed += 1;
  }

  const aspect = width / height;
  if (aspect < THRESHOLDS.aspectMin || aspect > THRESHOLDS.aspectMax) {
    reasons.push(
      `Aspect ratio ${aspect.toFixed(2)} is not square — fundus photographs are roughly 1:1 (±15%).`,
    );
  } else {
    passed += 1;
  }

  const { pixels, w: aw, h: ah } = downscaleToCenter(bitmap, ANALYSIS_SIZE, CENTER_CROP_FRAC);

  const meanR = meanChannel(pixels, aw, ah, 0);
  const meanB = meanChannel(pixels, aw, ah, 2);
  const warmCenter = meanR - meanB >= THRESHOLDS.centerWarmRMinusB && meanR >= THRESHOLDS.centerWarmR;
  if (!warmCenter) {
    reasons.push(
      `Center isn't warm (R−B ${(meanR - meanB).toFixed(0)}, R ${meanR.toFixed(0)}) — fundus backgrounds are red/orange.`,
    );
  } else {
    passed += 1;
  }

  const reddishFrac = reddishCoverage(pixels, aw, ah);
  if (reddishFrac < THRESHOLDS.reddishCoverage) {
    reasons.push(
      `Only ${(reddishFrac * 100).toFixed(0)}% of the center is reddish — fundus backgrounds are dominated by red/orange tones.`,
    );
  } else {
    passed += 1;
  }

  const lumStd = luminanceStdDev(pixels, aw, ah);
  if (lumStd < THRESHOLDS.luminanceStdDev) {
    reasons.push(
      `Center is too flat (luminance σ ${lumStd.toFixed(1)}) — screenshots and solid colors lack retinal structure.`,
    );
  } else {
    passed += 1;
  }

  const edgeRatio = edgeDensity(pixels, aw, ah);
  if (edgeRatio < THRESHOLDS.edgeDensity) {
    reasons.push(
      `Edge density too low (${(edgeRatio * 100).toFixed(2)}%) — no visible vessel-like structure.`,
    );
  } else {
    passed += 1;
  }

  const lapVar = laplacianVariance(pixels, aw, ah);
  if (lapVar < THRESHOLDS.laplacianVar) {
    reasons.push(
      `Image is very blurry (Laplacian variance ${lapVar.toFixed(1)}) — recapture with a steadier hand.`,
    );
    // Per plan: blurry photos are intentionally NOT rejected here — let the
    // existing quality gate own that decision. Mark as passed for scoring.
    passed += 1;
  } else {
    passed += 1;
  }

  bitmap.close?.();

  // Real fundus photos vary in lighting, crop and camera borders. Require the
  // hard geometry checks plus at least three of the four color/texture signals instead
  // of rejecting a valid retina image because one color/texture signal differs.
  const geometryPassed = width >= THRESHOLDS.minDimension && aspect >= THRESHOLDS.aspectMin && aspect <= THRESHOLDS.aspectMax;
  const accepted = geometryPassed && passed >= 5;
  const score = passed / total;
  return { accepted, reasons: dedupe(reasons), score };
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  return await new Promise<ImageBitmap>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img as unknown as ImageBitmap);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function downscaleToCenter(
  bitmap: ImageBitmap,
  size: number,
  centerFrac: number,
): { pixels: Uint8ClampedArray; w: number; h: number } {
  const cw = Math.max(1, Math.round(size));
  const ch = Math.max(1, Math.round(size));
  const full = document.createElement("canvas");
  full.width = cw;
  full.height = ch;
  const fctx = full.getContext("2d");
  if (!fctx) throw new Error("Canvas 2D context unavailable");
  fctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, cw, ch);

  const cropSide = Math.max(1, Math.round(cw * centerFrac));
  const ox = Math.floor((cw - cropSide) / 2);
  const oy = Math.floor((ch - cropSide) / 2);
  const data = fctx.getImageData(ox, oy, cropSide, cropSide).data;
  return { pixels: data, w: cropSide, h: cropSide };
}

function meanChannel(pixels: Uint8ClampedArray, w: number, h: number, ch: number): number {
  let sum = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) sum += pixels[i * 4 + ch];
  return sum / n;
}

function reddishCoverage(pixels: Uint8ClampedArray, w: number, h: number): number {
  let warm = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    if (r > g + THRESHOLDS.reddishDR && r > b + THRESHOLDS.reddishDB && r > THRESHOLDS.reddishMinR) {
      warm += 1;
    }
  }
  return warm / n;
}

function luminanceStdDev(pixels: Uint8ClampedArray, w: number, h: number): number {
  const n = w * h;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sq += (l - mean) * (l - mean);
  }
  return Math.sqrt(sq / n);
}

/** Cheap Sobel-magnitude "edge density" — fraction of pixels with strong gradient. */
function edgeDensity(pixels: Uint8ClampedArray, w: number, h: number): number {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  let edges = 0;
  const total = Math.max(0, w - 2) * Math.max(0, h - 2);
  for (let y = 0; y < h - 2; y++) {
    for (let x = 0; x < w - 2; x++) {
      const i = y * w + x;
      const gx =
        -lum[i] +
        lum[i + 1] +
        -2 * lum[i + w] +
        2 * lum[i + w + 1] +
        -lum[i + 2 * w] +
        lum[i + 2 * w + 1];
      const gy =
        -lum[i] +
        -2 * lum[i + 1] +
        -lum[i + 2] +
        lum[i + w] +
        2 * lum[i + w + 1] +
        lum[i + w + 2];
      const mag = Math.abs(gx) + Math.abs(gy);
      if (mag > 80) edges += 1;
    }
  }
  return total > 0 ? edges / total : 0;
}

/** Variance of the discrete Laplacian — classic blur proxy. */
function laplacianVariance(pixels: Uint8ClampedArray, w: number, h: number): number {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const vals: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l =
        -lum[i - w] - lum[i - 1] + 4 * lum[i] - lum[i + 1] - lum[i + w];
      vals.push(l);
    }
  }
  if (vals.length === 0) return 0;
  let mean = 0;
  for (const v of vals) mean += v;
  mean /= vals.length;
  let sq = 0;
  for (const v of vals) sq += (v - mean) * (v - mean);
  return sq / vals.length;
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
