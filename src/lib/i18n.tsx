"use client";

/**
 * DRISHTI lightweight i18n — English + Hindi (for camp deployments).
 * Scope: camp-facing UI chrome (nav, trust/status chips, dashboard stats,
 * queue filters, sign-off actions, screening actions). Technical deep-dive
 * views (how/validation/capacity/about) and model output strings stay English.
 *
 * Usage: const { lang, setLang, t } = useLang();  t("dash.stats.queue")
 * Hydration-safe: server renders EN; localStorage choice applies post-mount.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Lang = "en" | "hi";

const DICT: Record<string, { en: string; hi: string }> = {
  // ── nav / shell ──────────────────────────────────────────────
  "nav.home": { en: "Home", hi: "होम" },
  "nav.how": { en: "How it works", hi: "यह कैसे काम करता है" },
  "nav.screening": { en: "Screening", hi: "स्क्रीनिंग" },
  "nav.dashboard": { en: "Doctor Dashboard", hi: "डॉक्टर डैशबोर्ड" },
  "nav.validation": { en: "Validation", hi: "सत्यापन" },
  "nav.capacity": { en: "Capacity Planner", hi: "क्षमता योजनाकार" },
  "nav.about": { en: "About", hi: "परिचय" },
  "nav.launch": { en: "Launch Screening", hi: "स्क्रीनिंग शुरू करें" },
  "nav.menu": { en: "Toggle navigation menu", hi: "नेविगेशन मेनू खोलें/बंद करें" },
  "footer.demoChip": { en: "Demo data is simulated", hi: "डेमो डेटा — केवल नमूना" },

  // ── trust chips (trust color language) ──────────────────────
  "trust.HIGH": { en: "TRUSTED", hi: "भरोसेमंद" },
  "trust.MODERATE": { en: "REVIEW", hi: "समीक्षा" },
  "trust.LOW": { en: "URGENT", hi: "तत्काल" },

  // ── status chips (case lifecycle) ────────────────────────────
  "status.AUTO_CLEARED": { en: "Auto-cleared", hi: "स्वतः स्वीकृत" },
  "status.NEEDS_REVIEW": { en: "Needs review", hi: "समीक्षा शेष" },
  "status.URGENT": { en: "Urgent", hi: "अत्यावश्यक" },
  "status.REJECTED": { en: "Rejected", hi: "अस्वीकृत" },

  // ── dashboard ────────────────────────────────────────────────
  "dash.eyebrow": { en: "HUMAN-IN-THE-LOOP", hi: "मानव-निर्णय सहित" },
  "dash.title.a": { en: "Doctor Dashboard — ", hi: "डॉक्टर डैशबोर्ड — " },
  "dash.title.b": { en: "Review Queue", hi: "समीक्षा पंक्ति" },
  "dash.sub": {
    en: "HIGH-trust cases auto-clear. MODERATE cases wait for your sign-off. Urgent and DME cases jump the queue.",
    hi: "उच्च-भरोसा वाले केस स्वतः स्वीकृत होते हैं। मध्यम केस आपके साइन-ऑफ़ की प्रतीक्षा करते हैं। अत्यावश्यक और DME केस पंक्ति में सबसे आगे।",
  },
  "dash.demoChip": { en: "Demo data — simulated screening records", hi: "डेमो डेटा — नमूना जांच रिकॉर्ड" },
  "dash.stats.screened": { en: "Screened today", hi: "आज जांचे गए" },
  "dash.stats.screenedSub": { en: "cases through the DRISHTI pipeline today", hi: "केस आज DRISHTI पाइपलाइन से गुज़रे" },
  "dash.stats.referable": { en: "Referable caught", hi: "रेफरयोग्य पकड़े गए" },
  "dash.stats.referableSub": { en: "grade ≥ Moderate NPDR · refer within 3-6 months", hi: "ग्रेड ≥ मध्यम NPDR · 3-6 माह में रेफर करें" },
  "dash.stats.queue": { en: "Review queue", hi: "समीक्षा पंक्ति" },
  "dash.stats.queueSub": { en: "MODERATE + URGENT awaiting doctor sign-off", hi: "मध्यम + अत्यावश्यक केस डॉक्टर साइन-ऑफ़ की प्रतीक्षा में" },
  "dash.stats.signed": { en: "Signed off", hi: "साइन-ऑफ़ किए" },
  "dash.stats.signedSub": { en: "cases approved by the reviewing doctor", hi: "केस डॉक्टर द्वारा स्वीकृत" },
  "dash.stats.signedToday": { en: "approved today · closed in the register", hi: "आज स्वीकृत · रजिस्टर में बंद" },
  "dash.stats.avg": { en: "Avg processing time", hi: "औसत प्रोसेसिंग समय" },
  "dash.stats.avgSub": { en: "gate → evidence → CNN → Grad-CAM → trust", hi: "गेट → साक्ष्य → CNN → Grad-CAM → भरोसा" },
  "dash.tab.all": { en: "All", hi: "सभी" },
  "dash.tab.auto": { en: "Auto-cleared (HIGH)", hi: "स्वतः स्वीकृत (उच्च)" },
  "dash.tab.review": { en: "Needs review (MODERATE)", hi: "समीक्षा शेष (मध्यम)" },
  "dash.tab.urgent": { en: "Urgent (LOW + DME)", hi: "अत्यावश्यक (निम्न + DME)" },
  "dash.tab.rejected": { en: "Rejected", hi: "अस्वीकृत" },
  "dash.search": { en: "Search patient ID…", hi: "रोगी आईडी खोजें…" },
  "dash.exportCsv": { en: "Export CSV", hi: "CSV निर्यात" },
  "dash.exportSelected": { en: "Export selected", hi: "चयनित निर्यात" },
  "dash.registerPdf": { en: "Register PDF", hi: "रजिस्टर PDF" },
  "dash.signedChip": { en: "Signed", hi: "साइन" },
  "dash.bulk.selected": { en: "case selected", hi: "केस चयनित" },
  "dash.bulk.selectedPlural": { en: "cases selected", hi: "केस चयनित" },
  "dash.bulk.ready": { en: "ready for bulk sign-off · approvals close in the register", hi: "बल्क साइन-ऑफ़ के लिए तैयार · स्वीकृति रजिस्टर में बंद होगी" },
  "dash.bulk.signAll": { en: "Sign off all", hi: "सभी साइन-ऑफ़" },
  "dash.signOff": { en: "Approve & sign-off", hi: "स्वीकृत व साइन-ऑफ़" },
  "dash.signingOff": { en: "Signing off…", hi: "साइन-ऑफ़ हो रहा है…" },
  "dash.undo": { en: "Undo", hi: "पूर्ववत" },
  "dash.reopening": { en: "Reopening…", hi: "पुनः खोला जा रहा है…" },
  "dash.pdf": { en: "Download PDF", hi: "PDF डाउनलोड" },

  // ── screening ────────────────────────────────────────────────
  "screen.eyebrow": { en: "LIVE SCREENING", hi: "सजीव जांच" },
  "screen.title.a": { en: "Upload a retina. ", hi: "रेटिना अपलोड करें। " },
  "screen.title.b": { en: "Watch DRISHTI think.", hi: "DRISHTI की सोच देखिए।" },
  "screen.sub": {
    en: "Quality gate → evidence → grading → Grad-CAM → trust routing — every stage animates exactly like the real console.",
    hi: "गुणवत्ता गेट → साक्ष्य → ग्रेडिंग → Grad-CAM → भरोसा रूटिंग — हर चरण असली कंसोल जैसा दिखता है।",
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** translate by key */
  t: (key: string) => string;
};

const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => DICT[k]?.en ?? k });

const STORAGE_KEY = "drishti-lang";
const CHANGE_EVENT = "drishti-lang-change";

/** Tiny localStorage-backed store — useSyncExternalStore keeps hydration safe
 *  (server snapshot = "en") and syncs language across open tabs for free. */
function subscribeLang(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getLangSnapshot(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

function getLangServerSnapshot(): Lang {
  return "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getLangServerSnapshot);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode — in-memory only */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    document.documentElement.lang = l === "hi" ? "hi" : "en";
  }, []);

  // keep <html lang> in sync (plain DOM side effect — no state updates here)
  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
  }, [lang]);

  const t = useCallback((key: string) => DICT[key]?.[lang] ?? DICT[key]?.en ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

/** EN | हिं segmented toggle — used in the header (desktop + mobile nav). */
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={className}
      role="group"
      aria-label="Language / भाषा"
    >
      <div className="flex overflow-hidden rounded-full border border-white/12 bg-white/[0.03]" aria-label="Language / भाषा">
        {(["en", "hi"] as Lang[]).map((l) => {
          const active = lang === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={active}
              title={l === "en" ? "English" : "हिन्दी"}
              className={
                "min-h-9 px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (active ? "bg-[#22D3EE]/15 text-[#22D3EE]" : "text-muted-foreground hover:text-foreground")
              }
            >
              {l === "en" ? "EN" : "हिं"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
