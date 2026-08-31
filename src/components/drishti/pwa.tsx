"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
const getHydrated = () => true;
const getNotHydrated = () => false;

/**
 * PwaBridge — registers the service worker and renders a fixed connectivity
 * status pill (bottom-left). Online: a subtle green "cached for offline"
 * pill for the first 3s after mount, then it fades out and unmounts.
 * Offline: a persistent amber pill announcing cached results.
 * Rendered client-only (null on the server) so the pill appears exactly
 * at mount and never leaves an orphaned SSR copy in the DOM.
 */
export default function PwaBridge() {
  const mounted = useSyncExternalStore(emptySubscribe, getHydrated, getNotHydrated);
  const [online, setOnline] = useState(true);
  // Green pill is visible at mount, then fades out after 3s and unmounts.
  const [showOnlinePill, setShowOnlinePill] = useState(true);
  const [fading, setFading] = useState(false);

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
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
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

  if (!mounted) return null;

  const pill =
    "pointer-events-none fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur-sm transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none";

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${pill} border-[#FBBF24]/40 bg-[#0B1526]/95 text-[#FBBF24]`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        Offline — showing cached results
      </div>
    );
  }

  if (!showOnlinePill) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${pill} border-[#34D399]/40 bg-[#0B1526]/95 text-[#34D399] ${
        fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      Online · cached for offline
    </div>
  );
}
