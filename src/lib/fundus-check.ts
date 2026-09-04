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
 * Signals are split into two tiers:
 *   - HARD (any failure → reject): aspect ratio, resolution, decode
 *   - SOFT (warnings only): warm center, reddish coverage,
 *     luminance variance, edge density
 *
 * Blur (Laplacian variance) is recorded but never causes rejection — the
 * existing quality gate owns blur. It is excluded from the score so the
 * returned `score` is the actual pass rate of the four soft signals.
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
  centerWarmR: 60,
  reddishCoverage: 0.55,
  reddishDR: 15,
  reddishDB: 25,
  reddishMinR: 60,
  luminanceStdDev: 18,
  edgeDensity: 0.015,
  edgeMagnitude: 30,
  laplacianVar: 30,
} as const;

export type FundusCheckResult = {
  accepted: boolean;
  /** hard reasons to reject — only populated when accepted=false */
  reasons: string[];
  /** informational warnings (e.g. "looks blurry") that do not block acceptance */
  notes: string[];
  /** 0..1 fraction of soft signals that passed — debug aid, not displayed by default */
  score: number;
};

export async function looksLikeFundus(file: File): Promise<FundusCheckResult> {
  const hardReasons: string[] = [];
  const softReasons: string[] = [];
  let softPassed = 0;
  const softTotal = 4;

  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeBitmap(file);
  } catch {
    return {
      accepted: false,
      reasons: ["Couldn't decode the image — please upload a valid PNG/JPG fundus photograph."],
      notes: [],
      score: 0,
    };
  }

  const { width, height } = bitmap;

  if (width < THRESHOLDS.minDimension || height < THRESHOLDS.minDimension) {
    hardReasons.push(
      `Resolution too small (${width}×${height}) — fundus cameras produce at least ${THRESHOLDS.minDimension}px on each side.`,
    );
  }

  const aspect = width / height;
  if (aspect < THRESHOLDS.aspectMin || aspect > THRESHOLDS.aspectMax) {
    hardReasons.push(
      `Aspect ratio ${aspect.toFixed(2)} is not square — fundus photographs are roughly 1:1 (±15%).`,
    );
  }

  const { pixels, w: aw, h: ah } = downscaleToCenter(bitmap, ANALYSIS_SIZE, CENTER_CROP_FRAC);

  const meanR = meanChannel(pixels, aw, ah, 0);
  const meanB = meanChannel(pixels, aw, ah, 2);
  const warmCenter = meanR - meanB >= THRESHOLDS.centerWarmRMinusB && meanR >= THRESHOLDS.centerWarmR;
  if (warmCenter) {
    softPassed += 1;
  } else {
    softReasons.push(
      `Center isn't warm (R−B ${(meanR - meanB).toFixed(0)}, R ${meanR.toFixed(0)}) — fundus backgrounds are red/orange.`,
    );
  }

  const reddishFrac = reddishCoverage(pixels, aw, ah);
  if (reddishFrac >= THRESHOLDS.reddishCoverage) {
    softPassed += 1;
  } else {
    softReasons.push(
      `Only ${(reddishFrac * 100).toFixed(0)}% of the center is reddish — fundus backgrounds are dominated by red/orange tones.`,
    );
  }

  const lumStd = luminanceStdDev(pixels, aw, ah);
  if (lumStd >= THRESHOLDS.luminanceStdDev) {
    softPassed += 1;
  } else {
    softReasons.push(
      `Center is too flat (luminance σ ${lumStd.toFixed(1)}) — screenshots and solid colors lack retinal structure.`,
    );
  }

  const edgeRatio = edgeDensity(pixels, aw, ah);
  if (edgeRatio >= THRESHOLDS.edgeDensity) {
    softPassed += 1;
  } else {
    softReasons.push(
      `Edge density too low (${(edgeRatio * 100).toFixed(2)}%) — no visible vessel-like structure.`,
    );
  }

  // Blur is recorded but intentionally not a rejection signal — the existing
  // quality gate owns blur, and double-rejecting would be user-hostile.
  const lapVar = laplacianVariance(pixels, aw, ah);
  const blurNote =
    lapVar < THRESHOLDS.laplacianVar
      ? `Image looks blurry (Laplacian variance ${lapVar.toFixed(1)}) — the quality gate will re-check it.`
      : null;

  bitmap.close?.();

  const hardOk = hardReasons.length === 0;
  // Camera lighting, pigmentation, crop and exposure vary widely. Soft
  // signals must not block a plausible fundus image; the backend quality gate
  // and model are responsible for the clinical decision.
  const accepted = hardOk;
  const reasons = accepted ? [] : dedupe(hardReasons);
  const notes = dedupe([...softReasons, ...(blurNote ? [blurNote] : [])]);
  const score = softPassed / softTotal;
  return { accepted, reasons, notes, score };
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
      if (mag > THRESHOLDS.edgeMagnitude) edges += 1;
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
