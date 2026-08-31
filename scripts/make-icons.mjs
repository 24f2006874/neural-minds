// DRISHTI PWA icon generator — renders the DrishtiMark eye logo (from
// src/components/drishti/shell.tsx) as PNG app icons using sharp.
// Usage: bun scripts/make-icons.mjs  (or node scripts/make-icons.mjs)
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd(), "public", "icons");
const BG = "#060B14";

/** Compose the DrishtiMark eye (standalone 40x40 SVG recreation) centered
 *  on a solid #060B14 canvas. scale = fraction of the canvas the 40x40 mark
 *  box occupies; the maskable variant uses a smaller scale so the logo stays
 *  inside the >=10% safe zone. */
function iconSvg(size, scale) {
  const m = Math.round(size * scale);
  const o = Math.round((size - m) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${BG}"/>
  <svg x="${o}" y="${o}" width="${m}" height="${m}" viewBox="0 0 40 40" fill="none">
    <defs>
      <radialGradient id="iris" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#22D3EE"/>
        <stop offset="70%" stop-color="#0E7490"/>
        <stop offset="100%" stop-color="#083344"/>
      </radialGradient>
    </defs>
    <path d="M2 20 C10 8, 30 8, 38 20 C30 32, 10 32, 2 20 Z"
          stroke="#22D3EE" stroke-width="2" fill="rgba(34,211,238,0.06)"/>
    <circle cx="20" cy="20" r="8.5" fill="url(#iris)"/>
    <circle cx="20" cy="20" r="3.4" fill="#04121c"/>
    <circle cx="22.5" cy="17.5" r="1.3" fill="#A5F3FC"/>
  </svg>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, scale: 0.7 },
  { file: "icon-512.png", size: 512, scale: 0.7 },
  { file: "icon-512-maskable.png", size: 512, scale: 0.6 }, // mark ≤80% → ≥10% safe zone
  { file: "apple-touch-icon.png", size: 180, scale: 0.7 },
];

await mkdir(ROOT, { recursive: true });
for (const { file, size, scale } of ICONS) {
  const svg = Buffer.from(iconSvg(size, scale));
  await sharp(svg).png().toFile(path.join(ROOT, file));
  const meta = await sharp(path.join(ROOT, file)).metadata();
  console.log(`✓ ${file}  ${meta.width}x${meta.height}`);
}
