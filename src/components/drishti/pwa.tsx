"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, MonitorDown, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "drishti-install-dismissed";

const emptySubscribe = () => () => {};
const getHydrated = () => true;
const getNotHydrated = () => false;

/**
 * PwaBridge — registers the service worker and renders floating status UI:
 *
 * 1. Connectivity pill (bottom-left): a green "cached for offline" pill for
 *    the first 3s after mount, then it fades out and unmounts. Offline: a
 *    persistent amber pill announcing cached results.
 * 2. Install card: when the browser fires `beforeinstallprompt`, a
 *    dismissible glass card offers one-tap install of DRISHTI as a desktop /
 *    home-screen app (great for the demo laptop). Dismissal is remembered
 *    for the session. After `appinstalled`, a green confirmation pill shows
 *    briefly. Already-installed (standalone) sessions never see the card.
 *
 * Rendered client-only (null on the server) so nothing leaves an orphaned
 * SSR copy in the DOM.
 */
export default function PwaBridge() {
  const mounted = useSyncExternalStore(emptySubscribe, getHydrated, getNotHydrated);
  const [online, setOnline] = useState(true);
  // Green pill is visible at mount, then fades out after 3s and unmounts.
  const [showOnlinePill, setShowOnlinePill] = useState(true);
  const [fading, setFading] = useState(false);

  // Install prompt state. `installDismissed` starts true (hidden) and is
  // revealed in the effect so SSR/hydration never flashes the card.
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures (dev restarts, insecure context) are non-fatal */
      });
    }
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    // Already running as the installed app? Never offer the install card.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's default mini-infobar away
      if (!standalone) setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstalling(false);
      setJustInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (!standalone) {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) !== "1") setInstallDismissed(false);
      } catch {
        setInstallDismissed(false);
      }
    }

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const fadeTimer = setTimeout(() => setFading(true), 3000);
    const hideTimer = setTimeout(() => setShowOnlinePill(false), 3600);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [online]);

  useEffect(() => {
    if (!justInstalled) return;
    const t = setTimeout(() => setJustInstalled(false), 5000);
    return () => clearTimeout(t);
  }, [justInstalled]);

  const handleInstall = useCallback(async () => {
    if (!installEvent || installing) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") setInstallEvent(null);
    } catch {
      /* prompt unavailable (edge/protocol quirks) — card stays for retry */
    } finally {
      setInstalling(false);
    }
  }, [installEvent, installing]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked — dismissal is session-only anyway */
    }
  }, []);

  if (!mounted) return null;

  const showInstallCard = online && installEvent !== null && !installDismissed;
  // Status pills lift above the install card whenever it occupies the corner.
  const pillBottom = showInstallCard ? "bottom-[9.5rem] sm:bottom-[8.25rem]" : "bottom-4";

  const pill = `pointer-events-none fixed ${pillBottom} left-4 z-[60] flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur-sm transition-[opacity,transform,bottom] duration-500 ease-out motion-reduce:transition-none`;

  const statusPill =
    !online ? (
      <div
        key="offline"
        role="status"
        aria-live="polite"
        className={`${pill} border-[#FBBF24]/40 bg-[#0B1526]/95 text-[#FBBF24]`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        Offline — showing cached results
      </div>
    ) : showOnlinePill ? (
      <div
        key="online"
        role="status"
        aria-live="polite"
        className={`${pill} border-[#34D399]/40 bg-[#0B1526]/95 text-[#34D399] ${
          fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        Online · cached for offline
      </div>
    ) : null;

  return (
    <>
      {statusPill}

      {justInstalled && (
        <div
          role="status"
          aria-live="polite"
          className="rise-in pointer-events-none fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border border-[#34D399]/45 bg-[#0B1526]/95 px-3 py-1.5 text-xs text-[#34D399] backdrop-blur-sm"
        >
          <MonitorDown className="h-3.5 w-3.5" aria-hidden="true" />
          DRISHTI installed — works offline
        </div>
      )}

      {showInstallCard && (
        <div
          role="dialog"
          aria-label="Install DRISHTI app"
          className="rise-in fixed bottom-4 left-4 z-[60] w-[calc(100vw-2rem)] max-w-[280px] rounded-xl border border-[#22D3EE]/30 bg-[#0B1526]/95 p-3.5 shadow-[0_10px_36px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]">
              <MonitorDown className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold tracking-wide text-foreground">Install DRISHTI</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Add to this device — cached screenings keep working offline.
              </p>
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={installing}
                className="btn-glow-cyan mt-2.5 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#22D3EE] px-3 py-2 font-display text-xs font-semibold text-[#04121c] transition-all hover:bg-[#67E8F9] disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {installing ? "Opening installer…" : "Install app"}
              </button>
            </div>
            <button
              type="button"
              onClick={dismissInstall}
              aria-label="Dismiss install prompt"
              title="Dismiss for this session"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
