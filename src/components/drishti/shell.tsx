"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import {
  BadgeCheck,
  Eye,
  Gauge,
  Github,
  HeartHandshake,
  Info,
  LayoutDashboard,
  Menu,
  ScanEye,
  ShieldCheck,
  Stethoscope,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── View routing (SPA — the user sees only "/") ───────────────────────

export type ViewKey = "home" | "how" | "screening" | "dashboard" | "validation" | "capacity" | "about";

export const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof Eye }> = [
  { key: "home", label: "Home", icon: Eye },
  { key: "how", label: "How it works", icon: Workflow },
  { key: "screening", label: "Screening", icon: ScanEye },
  { key: "dashboard", label: "Doctor Dashboard", icon: LayoutDashboard },
  { key: "validation", label: "Validation", icon: BadgeCheck },
  { key: "capacity", label: "Capacity Planner", icon: Gauge },
  { key: "about", label: "About", icon: Users },
];

interface NavCtx {
  view: ViewKey;
  navigate: (v: ViewKey, anchor?: string) => void;
}

const NavContext = createContext<NavCtx>({ view: "home", navigate: () => {} });
export const useNav = () => useContext(NavContext);

export function NavProvider({ children }: { children: (view: ViewKey) => ReactNode }) {
  const [view, setView] = useState<ViewKey>("home");

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace(/^#\/?/, "") as ViewKey;
      if (NAV_ITEMS.some((n) => n.key === h)) setView(h);
      else setView("home");
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const navigate = useCallback((v: ViewKey, anchor?: string) => {
    window.location.hash = `/${v}`;
    setView(v);
    requestAnimationFrame(() => {
      if (anchor) {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }, []);

  const value = useMemo(() => ({ view, navigate }), [view, navigate]);

  return (
    <NavContext.Provider value={value}>
      <Shell view={view}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            {children(view)}
          </motion.div>
        </AnimatePresence>
      </Shell>
    </NavContext.Provider>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────

export function DrishtiMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="dm-iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="70%" stopColor="#0E7490" />
          <stop offset="100%" stopColor="#083344" />
        </radialGradient>
      </defs>
      <path
        d="M2 20 C10 8, 30 8, 38 20 C30 32, 10 32, 2 20 Z"
        stroke="#22D3EE"
        strokeWidth="2"
        fill="rgba(34,211,238,0.06)"
      />
      <circle cx="20" cy="20" r="8.5" fill="url(#dm-iris)" />
      <circle cx="20" cy="20" r="3.4" fill="#04121c" />
      <circle cx="22.5" cy="17.5" r="1.3" fill="#A5F3FC" />
    </svg>
  );
}

// ── Header ────────────────────────────────────────────────────────────

function Header() {
  const { view, navigate } = useNav();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#22D3EE]/12 bg-[#060B14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <button
          onClick={() => navigate("home")}
          className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          aria-label="DRISHTI home"
        >
          <DrishtiMark />
          <span className="font-display text-lg font-bold tracking-[0.18em] text-foreground">DRISHTI</span>
          <span className="chip ml-1 hidden border-[#22D3EE]/30 text-[10px] text-[#22D3EE] md:inline-flex">SIH 2026 · PS 26038</span>
        </button>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((n) => (
            <button
              key={n.key}
              onClick={() => navigate(n.key)}
              aria-current={view === n.key ? "page" : undefined}
              className={cn(
                "relative rounded-md px-3 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                view === n.key ? "text-[#22D3EE]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {n.label}
              {view === n.key && (
                <motion.span
                  layoutId="nav-underline"
                  className="absolute inset-x-2 -bottom-[13px] h-[2px] bg-[#22D3EE]"
                  style={{ boxShadow: "0 0 12px rgba(34,211,238,0.8)" }}
                />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("screening")}
            className="btn-glow-cyan hidden rounded-lg bg-[#22D3EE] px-4 py-2 font-display text-sm font-semibold text-[#04121c] transition-all sm:block"
          >
            Launch Screening
          </button>
          <button
            className="rounded-md border border-white/10 p-2 text-foreground lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Toggle navigation menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* mobile nav */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-[#22D3EE]/10 bg-[#060B14]/95 backdrop-blur-xl lg:hidden"
            aria-label="Mobile"
          >
            <div className="space-y-1 px-4 py-3">
              {NAV_ITEMS.map((n) => (
                <button
                  key={n.key}
                  onClick={() => {
                    navigate(n.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    view === n.key ? "bg-[#22D3EE]/10 text-[#22D3EE]" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </button>
              ))}
              <button
                onClick={() => {
                  navigate("screening");
                  setOpen(false);
                }}
                className="btn-glow-cyan mt-2 w-full rounded-lg bg-[#22D3EE] px-4 py-2.5 font-display text-sm font-semibold text-[#04121c]"
              >
                Launch Screening
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

// ── Footer (sticky bottom) ────────────────────────────────────────────

function Footer() {
  const { navigate } = useNav();
  return (
    <footer className="mt-auto border-t border-[#22D3EE]/12 bg-[#050910]/90 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <DrishtiMark size={26} />
            <span className="font-display text-base font-bold tracking-[0.18em]">DRISHTI</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            AI that knows when to trust itself. Trust-gated diabetic retinopathy screening for the last mile —
            quality gate, lesion evidence, CNN grading, Grad-CAM explainability, trust routing.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
            Research prototype validated on 550 held-out APTOS images — not a certified clinical device.
          </p>
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Platform</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {NAV_ITEMS.slice(1, 6).map((n) => (
              <li key={n.key}>
                <button onClick={() => navigate(n.key)} className="text-muted-foreground transition-colors hover:text-[#22D3EE]">
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Credits & links</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-[#22D3EE]" /> APTOS 2019 — Aravind Eye Hospital
            </li>
            <li className="flex items-center gap-2">
              <HeartHandshake className="h-3.5 w-3.5 text-[#22D3EE]" /> STARE — Clemson University
            </li>
            <li className="flex items-center gap-2">
              <Stethoscope className="h-3.5 w-3.5 text-[#22D3EE]" /> Built with MathWorks tools
            </li>
            <li>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition-colors hover:text-[#22D3EE]"
              >
                <Github className="h-3.5 w-3.5" /> github.com/team-neural-minds
              </a>
            </li>
            <li>
              <button onClick={() => navigate("about")} className="inline-flex items-center gap-2 transition-colors hover:text-[#22D3EE]">
                <Info className="h-3.5 w-3.5" /> About the team
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-4">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© 2026 Team Neural Minds · SIH 2026 · PS 26038 (MathWorks)</span>
          <span className="flex items-center gap-2">
            <span className="chip border-[#FBBF24]/30 text-[#FBBF24]">Demo data is simulated</span>
            <span className="chip border-[#22D3EE]/30 text-[#22D3EE]">v1.0.0-web</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────

function Shell({ children }: { view: ViewKey; children: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  return (
    <div className="drishti-scene flex min-h-screen flex-col">
      <Header />
      {/* scroll progress — cinematic cyan hairline */}
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-16 z-50 h-[2px] origin-left bg-gradient-to-r from-[#22D3EE] via-[#34D399] to-[#22D3EE]"
        style={{ scaleX: progress, boxShadow: "0 0 12px rgba(34,211,238,0.55)" }}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
