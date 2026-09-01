"use client";

/**
 * HeroEye — procedural 3D human eye (react-three-fiber) for the DRISHTI hero.
 *
 * - Eyeball: dark translucent sphere (MeshPhysicalMaterial + clearcoat)
 * - Iris: canvas-generated radial texture (cyan striations, limbal ring), "breathing" 1↔1.06 / 4s
 * - Vessels: 9 TubeGeometry arcs hugging the sphere, additive cyan, opacity pulsing
 * - Particles: 300-point shell, slow rotation
 * - Mouse parallax (±0.12 rad) tracked on window so the canvas stays pointer-events: none
 *
 * Safety: static CSS fallback when WebGL is unavailable, prefers-reduced-motion is set,
 * or the scene throws (error boundary). Fully decorative: aria-hidden.
 */

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";
import { DrishtiMark } from "@/components/drishti/shell";
import { cn } from "@/lib/utils";

// ── capability detection ─────────────────────────────────────────────

function hasWebGL(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── static fallback (no WebGL / reduced motion / render error) ───────

export function HeroEyeFallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center", className)} aria-hidden="true">
      <div
        className="float-slow relative flex items-center justify-center rounded-full"
        style={{
          width: "min(58vmin, 460px)",
          height: "min(58vmin, 460px)",
          background:
            "radial-gradient(circle at 42% 38%, rgba(165,243,252,0.30), rgba(34,211,238,0.18) 34%, rgba(14,116,144,0.16) 62%, rgba(8,51,68,0.06) 80%, transparent 100%)",
          border: "1px solid rgba(34,211,238,0.25)",
          boxShadow: "0 0 90px rgba(34,211,238,0.22), inset 0 0 60px rgba(34,211,238,0.14)",
        }}
      >
        <DrishtiMark size={110} />
      </div>
    </div>
  );
}

// ── error boundary → static fallback ─────────────────────────────────

class EyeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { errored: boolean }> {
  state = { errored: false };
  static getDerivedStateFromError() {
    return { errored: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[HeroEye] 3D scene failed, using static fallback:", error);
  }
  render() {
    return this.state.errored ? this.props.fallback : this.props.children;
  }
}

// ── deterministic RNG (same eye on every load) ───────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── procedural iris texture (canvas → CanvasTexture) ─────────────────

function createIrisTexture(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for iris texture");
  const rng = mulberry32(26038);
  const c = S / 2;
  const R = S / 2;

  // base: bright cyan core → deep teal edge
  const base = ctx.createRadialGradient(c, c, 0, c, c, R);
  base.addColorStop(0, "#A5F3FC");
  base.addColorStop(0.28, "#22D3EE");
  base.addColorStop(0.62, "#0E7490");
  base.addColorStop(1, "#083344");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // radial striations (fibers of the iris)
  ctx.lineCap = "round";
  for (let i = 0; i < 150; i++) {
    const a0 = rng() * Math.PI * 2;
    const r0 = R * (0.3 + rng() * 0.08);
    const r1 = R * (0.62 + rng() * 0.34);
    const sway = (rng() - 0.5) * 0.35;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0);
    ctx.lineTo(c + Math.cos(a0 + sway) * r1, c + Math.sin(a0 + sway) * r1);
    const dark = rng() > 0.55;
    ctx.strokeStyle = dark
      ? `rgba(6, 42, 58, ${0.12 + rng() * 0.3})`
      : `rgba(190, 250, 255, ${0.06 + rng() * 0.2})`;
    ctx.lineWidth = 1 + rng() * 2.4;
    ctx.stroke();
  }

  // faint concentric rings
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(c, c, R * (0.4 + i * 0.11), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(8, 51, 68, ${0.1 + rng() * 0.12})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // darker limbal ring at the outer edge
  const limbal = ctx.createRadialGradient(c, c, R * 0.72, c, c, R);
  limbal.addColorStop(0, "rgba(4, 16, 26, 0)");
  limbal.addColorStop(0.75, "rgba(4, 16, 26, 0.55)");
  limbal.addColorStop(1, "rgba(3, 10, 18, 0.95)");
  ctx.fillStyle = limbal;
  ctx.fillRect(0, 0, S, S);

  // shadow melt around the pupil
  const inner = ctx.createRadialGradient(c, c, 0, c, c, R * 0.34);
  inner.addColorStop(0, "rgba(2, 8, 14, 0.9)");
  inner.addColorStop(0.7, "rgba(2, 8, 14, 0.35)");
  inner.addColorStop(1, "rgba(2, 8, 14, 0)");
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── vessels: TubeGeometry arcs hugging the eyeball (r ≈ 2.02) ────────

interface VesselSpec {
  curve: THREE.CatmullRomCurve3;
  radius: number;
  opacity: number;
  phase: number;
  speed: number;
}

function buildVesselSpecs(): VesselSpec[] {
  const rng = mulberry32(4242);
  const specs: VesselSpec[] = [];
  for (let i = 0; i < 9; i++) {
    const u = rng() * 1.5 - 0.75;
    const a = rng() * Math.PI * 2;
    const start = new THREE.Vector3(
      Math.sqrt(1 - u * u) * Math.cos(a),
      u,
      Math.sqrt(1 - u * u) * Math.sin(a)
    ).normalize();
    // rotate `start` toward the front pole (+z) around a wobbled perpendicular axis
    let axis = new THREE.Vector3().crossVectors(start, new THREE.Vector3(0, 0, 1));
    if (axis.lengthSq() < 1e-4) axis = new THREE.Vector3(0, 1, 0);
    axis.normalize().applyAxisAngle(start, (rng() - 0.5) * 1.4);
    const sweep = 0.55 + rng() * 1.25;
    const pts: THREE.Vector3[] = [];
    const N = 8;
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const dir = start.clone().applyAxisAngle(axis, sweep * t).normalize();
      pts.push(dir.multiplyScalar(2.02 + Math.sin(t * Math.PI) * 0.018));
    }
    specs.push({
      curve: new THREE.CatmullRomCurve3(pts),
      radius: 0.012 + rng() * 0.014,
      opacity: 0.25 + rng() * 0.3,
      phase: rng() * Math.PI * 2,
      speed: 0.5 + rng() * 0.7,
    });
  }
  return specs;
}

function Vessels() {
  const group = useRef<THREE.Group>(null);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  const specs = useMemo(() => buildVesselSpecs(), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (group.current) group.current.rotation.y += delta * 0.04;
    for (let i = 0; i < mats.current.length; i++) {
      const s = specs[i];
      const m = mats.current[i];
      if (s && m) m.opacity = s.opacity + 0.12 * Math.sin(t * s.speed + s.phase);
    }
  });

  return (
    <group ref={group}>
      {specs.map((v, i) => (
        <mesh key={i}>
          <tubeGeometry args={[v.curve, 40, v.radius, 6, false]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            color="#22D3EE"
            transparent
            opacity={v.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── floating particle field (shell r 2.5–4.5) ────────────────────────

function ParticleField() {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const rng = mulberry32(77);
    const N = 300;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const cyan = new THREE.Color("#22D3EE");
    const white = new THREE.Color("#E0F7FF");
    for (let i = 0; i < N; i++) {
      const r = 2.5 + rng() * 2;
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(a);
      positions[i * 3 + 1] = r * u * 0.8;
      positions[i * 3 + 2] = r * s * Math.sin(a);
      const col = rng() > 0.62 ? white : cyan;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    return { positions, colors };
  }, []);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.05;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.75}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ── the full eye rig (parallax + iris breathing + responsive framing) ─

function EyeRig() {
  const group = useRef<THREE.Group>(null);
  const iris = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  // window-level pointer tracking → canvas itself stays pointer-events: none
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // gentle mouse parallax (±0.12 rad), critically damped
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, pointer.current.x * 0.12, 2.2, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pointer.current.y * 0.12, 2.2, delta);

    // responsive framing: eye right on desktop, up-top on portrait screens
    const aspect = state.size.width / Math.max(1, state.size.height);
    const desktop = aspect >= 1.05;
    g.position.x = THREE.MathUtils.damp(g.position.x, desktop ? 1.55 : 0, 3, delta);
    g.position.y = THREE.MathUtils.damp(g.position.y, desktop ? 0 : 1.0, 3, delta);
    const target = desktop ? 1 : Math.min(1, Math.max(0.55, aspect * 0.95));
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, target, 3, delta));

    // iris dilation "breathing": 1 ↔ 1.06 on a ~4s sine cycle
    if (iris.current) {
      iris.current.scale.setScalar(1.03 - 0.03 * Math.cos((t / 4) * Math.PI * 2));
    }
  });

  const texture = useMemo(() => createIrisTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group ref={group}>
      {/* eyeball */}
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <meshPhysicalMaterial
          color="#0A1628"
          roughness={0.35}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.25}
          transparent
          opacity={0.97}
        />
      </mesh>

      {/* luminous vessels on the surface */}
      <Vessels />

      {/* iris + pupil + glint (breathing group) */}
      <group ref={iris}>
        <mesh position={[0, 0, 1.95]}>
          <circleGeometry args={[1.02, 64]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 1.96]}>
          <circleGeometry args={[0.4, 48]} />
          <meshBasicMaterial color="#020509" toneMapped={false} />
        </mesh>
        <mesh position={[0.36, 0.3, 1.97]}>
          <circleGeometry args={[0.075, 24]} />
          <meshBasicMaterial color="#CFF9FF" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {/* ambient particle field */}
      <ParticleField />
    </group>
  );
}

// ── public component ─────────────────────────────────────────────────

export default function HeroEye() {
  // Loaded via next/dynamic { ssr: false } → first render is always client-side,
  // so capabilities can be read directly in the lazy initializer (no effect needed).
  const [mode] = useState<"3d" | "static">(() =>
    typeof window === "undefined" || prefersReducedMotion() || !hasWebGL() ? "static" : "3d"
  );

  if (mode !== "3d") return <HeroEyeFallback />;

  return (
    <EyeErrorBoundary fallback={<HeroEyeFallback />}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute inset-0"
      >
        <Suspense fallback={<HeroEyeFallback />}>
          <Canvas
            dpr={[1, 1.75]}
            camera={{ position: [0, 0, 7.2], fov: 40 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            style={{ pointerEvents: "none" }}
          >
            {/* low ambient + cyan key + soft warm rim from behind */}
            <ambientLight intensity={0.4} />
            <pointLight position={[-4, 2.5, 5]} intensity={60} distance={26} decay={2} color="#22D3EE" />
            <directionalLight position={[3, 5, -7]} intensity={2.2} color="#FFD9A6" />
            <EyeRig />
          </Canvas>
        </Suspense>
      </motion.div>
    </EyeErrorBoundary>
  );
}
