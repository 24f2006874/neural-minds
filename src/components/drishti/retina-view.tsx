"use client";

import { useMemo } from "react";
import { buildLesions, type EvidenceResult } from "@/lib/drishti";
import { cn } from "@/lib/utils";

/**
 * RetinaView — procedural, interactive fundus rendering used across the app.
 * Pure SVG: no image assets, full control over lesion layers, Grad-CAM overlay,
 * blur (quality-gate demo), vessel growth animation and the scanning laser line.
 *
 * Coordinate space: normalized 0-1 (optic disc ≈ 0.30/0.38, macula ≈ 0.62/0.55)
 * mapped onto a 200×200 viewBox.
 */

export interface RetinaLayers {
  vessels?: boolean;
  ma?: boolean;
  hem?: boolean;
  ex?: boolean;
  dme?: boolean;
  gradcam?: boolean;
}

export interface RetinaViewProps {
  /** ICDR severity 0-4 — drives default lesion density when no explicit lesions given */
  severity?: number;
  dmeRisk?: boolean;
  layers?: RetinaLayers;
  /** 0..1 — fundus blur amount (quality gate demo) */
  blur?: number;
  /** sweeping laser line (processing state) */
  scanning?: boolean;
  /** explicit lesion coords from the pipeline (normalized 0-1) */
  lesions?: EvidenceResult["lesions"];
  /** explicit gradcam config from the pipeline (normalized 0-1) */
  gradcam?: EvidenceResult["gradcam"];
  /** animate vessels growing (hero moments) */
  vesselDraw?: boolean;
  /** dim fundus (rejected images) */
  rejected?: boolean;
  className?: string;
}

const VESSEL_PATHS: Array<{ d: string; w: number; o?: number }> = [
  { d: "M62,74 C76,58 92,52 118,54", w: 2.6 },
  { d: "M62,74 C74,62 88,58 104,58", w: 1.9, o: 0.9 },
  { d: "M118,54 C132,56 146,62 158,72", w: 2.0 },
  { d: "M158,72 C166,78 172,86 176,96", w: 1.4, o: 0.85 },
  { d: "M62,80 C76,94 92,102 116,104", w: 2.6 },
  { d: "M62,80 C74,92 84,100 96,110", w: 1.8, o: 0.9 },
  { d: "M116,104 C132,104 146,110 156,120", w: 2.0 },
  { d: "M156,120 C164,128 170,138 172,148", w: 1.3, o: 0.85 },
  { d: "M60,70 C54,56 48,44 38,34", w: 2.2 },
  { d: "M38,34 C32,28 24,22 16,20", w: 1.4, o: 0.85 },
  { d: "M60,74 C50,68 40,66 30,68", w: 1.6, o: 0.85 },
  { d: "M60,84 C52,92 44,102 40,112", w: 2.2 },
  { d: "M40,112 C36,124 32,136 26,146", w: 1.4, o: 0.85 },
  { d: "M64,86 C62,100 62,114 58,128", w: 1.7, o: 0.85 },
  { d: "M66,72 C76,66 90,64 102,66", w: 1.3, o: 0.7 },
  { d: "M104,58 C114,48 126,44 140,44", w: 1.4, o: 0.8 },
  { d: "M116,104 C120,116 122,128 120,140", w: 1.5, o: 0.8 },
  { d: "M96,110 C98,122 100,132 106,142", w: 1.3, o: 0.75 },
  { d: "M140,44 C150,42 158,44 166,50", w: 1.1, o: 0.7 },
  { d: "M120,140 C122,150 128,158 136,162", w: 1.1, o: 0.7 },
];

export function RetinaView({
  severity = 0,
  dmeRisk = false,
  layers,
  blur = 0,
  scanning = false,
  lesions,
  gradcam,
  vesselDraw = false,
  rejected = false,
  className,
}: RetinaViewProps) {
  const L: Required<RetinaLayers> = {
    vessels: layers?.vessels ?? true,
    ma: layers?.ma ?? severity >= 1,
    hem: layers?.hem ?? severity >= 2,
    ex: layers?.ex ?? severity >= 2,
    dme: layers?.dme ?? dmeRisk,
    gradcam: layers?.gradcam ?? false,
  };

  const data = useMemo(() => {
    if (lesions) return { lesions, gradcam };
    const generated = buildLesions(
      `retina-${severity}-${dmeRisk ? "dme" : "no-dme"}`,
      {
        maCount: severity === 0 ? 0 : severity === 1 ? 7 : severity === 2 ? 34 : severity === 3 ? 58 : 48,
        hemCount: severity >= 2 ? (severity === 2 ? 8 : 16) : 0,
        exCount: severity >= 2 ? (dmeRisk ? 16 : 9) : 0,
        dmeRisk,
        severity,
      }
    );
    const gc =
      gradcam ??
      (severity === 0
        ? { cx: 0.3, cy: 0.38, rx: 0.15, ry: 0.14, intensity: 0.32 }
        : dmeRisk
          ? { cx: 0.62, cy: 0.55, rx: 0.17, ry: 0.16, intensity: 0.95 }
          : { cx: 0.44 + severity * 0.03, cy: 0.46, rx: 0.11 + severity * 0.02, ry: 0.1 + severity * 0.02, intensity: 0.45 + severity * 0.12 });
    return { lesions: generated, gradcam: gc };
  }, [lesions, gradcam, severity, dmeRisk]);

  const blurDev = Math.min(6, blur * 6);
  const gc = data.gradcam;
  const showLesions = severity > 0 || L.ma || L.hem || L.ex;

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black", className)}>
      <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Retinal fundus view">
        <defs>
          <radialGradient id="rv-fundus" cx="55%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#c05a22" />
            <stop offset="45%" stopColor="#8f3717" />
            <stop offset="80%" stopColor="#571c0c" />
            <stop offset="100%" stopColor="#260903" />
          </radialGradient>
          <radialGradient id="rv-disc" cx="45%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#f4e3bd" />
            <stop offset="70%" stopColor="#e2c294" />
            <stop offset="100%" stopColor="#c9a06c" stopOpacity="0.4" />
          </radialGradient>
          <radialGradient id="rv-macula" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#5e1d0b" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#5e1d0b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rv-cam" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff8b8" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#ffb020" stopOpacity="0.8" />
            <stop offset="65%" stopColor="#ff4d2e" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ff2d00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rv-vignette" cx="50%" cy="50%" r="52%">
            <stop offset="78%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#12030a" stopOpacity="0.8" />
          </radialGradient>
          <clipPath id="rv-clip">
            <circle cx="100" cy="100" r="97" />
          </clipPath>
          <filter id="rv-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={blurDev} />
          </filter>
          <filter id="rv-lesion-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="0.7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g clipPath="url(#rv-clip)">
          {/* fundus base */}
          <g filter={blurDev > 0.05 ? "url(#rv-blur)" : undefined}>
            <circle cx="100" cy="100" r="98" fill="url(#rv-fundus)" />

            {/* vessel tree */}
            {L.vessels && (
              <g fill="none" stroke="#6d130c" strokeLinecap="round" opacity={0.9}>
                {VESSEL_PATHS.map((v, i) => (
                  <path
                    key={i}
                    d={v.d}
                    stroke={v.o && v.o < 0.85 ? "#7e1a10" : "#6d130c"}
                    strokeWidth={v.w}
                    opacity={v.o ?? 1}
                    pathLength={1}
                    className={vesselDraw ? "vessel-draw" : undefined}
                    style={vesselDraw ? { animationDelay: `${i * 0.12}s` } : undefined}
                  />
                ))}
                {/* fine twigs */}
                <path d="M100,58 C108,52 116,50 126,50" strokeWidth="0.7" opacity="0.55" />
                <path d="M84,102 C90,108 96,112 104,114" strokeWidth="0.7" opacity="0.55" />
                <path d="M46,44 C50,40 56,38 60,38" strokeWidth="0.6" opacity="0.5" />
              </g>
            )}

            {/* optic disc */}
            <ellipse cx="62" cy="74" rx="11" ry="10" fill="url(#rv-disc)" opacity="0.95" />
            <ellipse cx="62" cy="74" rx="3.4" ry="3" fill="#caa06c" opacity="0.85" />

            {/* macula */}
            <ellipse cx="128" cy="112" rx="15" ry="13" fill="url(#rv-macula)" />
            <ellipse cx="128" cy="112" rx="6" ry="5.4" fill="#4a1408" opacity="0.4" />

            {/* lesions */}
            {showLesions && (
              <g>
                {L.hem &&
                  data.lesions.hemorrhages.map((h, i) => (
                    <circle
                      key={`h${i}`}
                      cx={h.x * 200}
                      cy={h.y * 200}
                      r={h.r * 200}
                      fill="#7e0f0f"
                      opacity="0.85"
                      filter="url(#rv-lesion-glow)"
                      className="lesion-pop"
                      style={{ animationDelay: `${0.15 + i * 0.05}s` }}
                    />
                  ))}
                {L.ma &&
                  data.lesions.microaneurysms.map((m, i) => (
                    <circle
                      key={`m${i}`}
                      cx={m.x * 200}
                      cy={m.y * 200}
                      r={m.r * 200}
                      fill="#e0331f"
                      filter="url(#rv-lesion-glow)"
                      className="lesion-pop"
                      style={{ animationDelay: `${0.1 + i * 0.035}s` }}
                    />
                  ))}
                {L.ex &&
                  data.lesions.exudates.map((e, i) => (
                    <circle
                      key={`e${i}`}
                      cx={e.x * 200}
                      cy={e.y * 200}
                      r={e.r * 200}
                      fill="#f2d66c"
                      opacity="0.92"
                      className="lesion-pop"
                      style={{ animationDelay: `${0.2 + i * 0.04}s` }}
                    />
                  ))}
              </g>
            )}

            {/* DME risk ring around macula */}
            {L.dme && (
              <g>
                <circle
                  cx="128"
                  cy="112"
                  r="24"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="1.1"
                  strokeDasharray="5 4"
                  opacity="0.85"
                  className="cam-breathe"
                />
                <circle
                  cx="128"
                  cy="112"
                  r="30"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="0.7"
                  strokeDasharray="2 5"
                  opacity="0.6"
                />
              </g>
            )}
          </g>

          {/* Grad-CAM heatmap — melts over the un-blurred fundus */}
          {L.gradcam && gc && (
            <g style={{ mixBlendMode: "screen" }} className="cam-breathe">
              <ellipse
                cx={gc.cx * 200}
                cy={gc.cy * 200}
                rx={Math.max(10, gc.rx * 200)}
                ry={Math.max(9, gc.ry * 200)}
                fill="url(#rv-cam)"
                opacity={Math.min(1, gc.intensity * 0.9)}
              />
              <ellipse
                cx={gc.cx * 200}
                cy={gc.cy * 200}
                rx={Math.max(14, gc.rx * 240)}
                ry={Math.max(12, gc.ry * 240)}
                fill="none"
                stroke="#ffb020"
                strokeWidth="0.5"
                strokeDasharray="3 3"
                opacity={gc.intensity * 0.55}
              />
            </g>
          )}

          {/* vignette + rejected stamp */}
          <circle cx="100" cy="100" r="98" fill="url(#rv-vignette)" />
          {rejected && (
            <g transform="rotate(-14 100 100)" opacity="0.92">
              <rect x="22" y="82" width="156" height="36" rx="6" fill="#1a0505" opacity="0.85" stroke="#f87171" strokeWidth="1.6" />
              <text
                x="100"
                y="106"
                textAnchor="middle"
                fontSize="15"
                fontFamily="var(--font-display)"
                fontWeight="700"
                fill="#f87171"
                letterSpacing="3"
              >
                REJECTED
              </text>
              <text x="100" y="130" textAnchor="middle" fontSize="7.5" fill="#f8a5a5" letterSpacing="1.5">
                RECAPTURE REQUIRED
              </text>
            </g>
          )}
        </g>
      </svg>

      {/* scanning laser line */}
      {scanning && <div className="scanline" aria-hidden="true" />}
    </div>
  );
}
