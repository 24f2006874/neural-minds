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

  // ── dialogs (reopen + bulk confirm) ──────────────────────
  "dash.reopen.title": { en: "Reopen {id} for review?", hi: "{id} को पुनः समीक्षा के लिए खोलें?" },
  "dash.reopen.body.a": { en: "The sign-off will be cleared and the case returns to the ", hi: "साइन-ऑफ़ हटा दिया जाएगा और केस वापस " },
  "dash.reopen.queueUrgent": { en: "urgent", hi: "अत्यावश्यक" },
  "dash.reopen.queueReview": { en: "review", hi: "समीक्षा" },
  "dash.reopen.body.b": {
    en: " queue. The audit trail records the reopen — re-approve when you're ready.",
    hi: " पंक्ति में चला जाएगा। ऑडिट ट्रेल में पुनः-खोलना दर्ज होगा — जब तैयार हों दोबारा स्वीकृत करें।",
  },
  "dash.reopen.keep": { en: "Keep sign-off", hi: "साइन-ऑफ़ रखें" },
  "dash.reopen.confirm": { en: "Reopen case", hi: "केस पुनः खोलें" },
  "dash.bulk.titleOne": { en: "Sign off 1 case?", hi: "1 केस साइन-ऑफ़ करें?" },
  "dash.bulk.titleMany": { en: "Sign off {n} cases?", hi: "{n} केस साइन-ऑफ़ करें?" },
  "dash.bulk.body.a": { en: "Each selected case becomes ", hi: "हर चयनित केस " },
  "dash.bulk.body.hl": { en: "auto-cleared with your sign-off", hi: "आपके साइन-ऑफ़ के साथ स्वतः स्वीकृत" },
  "dash.bulk.body.b": { en: " recorded in the audit trail. Cases: ", hi: " बनेगा और ऑडिट ट्रेल में दर्ज होगा। केस: " },
  "dash.bulk.body.c": {
    en: ". Each sign-off can be undone later from its report.",
    hi: "। हर साइन-ऑफ़ बाद में उसकी रिपोर्ट से पूर्ववत किया जा सकता है।",
  },
  "dash.bulk.cancel": { en: "Cancel", hi: "रद्द करें" },
  "dash.bulk.confirm": { en: "Approve & sign off {n}", hi: "{n} स्वीकृत व साइन-ऑफ़" },
  "dash.bulk.signing": { en: "Signing off…", hi: "साइन-ऑफ़ हो रहा है…" },
  "dash.queueUrgent": { en: "urgent", hi: "अत्यावश्यक" },
  "dash.queueReview": { en: "review", hi: "समीक्षा" },
  "dash.showing": { en: "Showing {n} of {total} cases in this lane matching “{q}”", hi: "इस पंक्ति में “{q}” से मेल खाते {total} में से {n} केस" },
  "dash.noMatch.hint": {
    en: "IDs look like SEVERE-001 or RAMPUR-0118",
    hi: "आईडी ऐसे दिखते हैं: SEVERE-001 या RAMPUR-0118",
  },
  "dash.noMatch": { en: "No cases match your search", hi: "खोज से कोई केस मेल नहीं खाता" },
  "dash.retry": { en: "Retry", hi: "पुनः प्रयास" },
  "dash.signedOffBy": { en: "Signed off", hi: "साइन-ऑफ़" },
  "dash.signedChipTitle": { en: "Approved by the reviewing doctor", hi: "डॉक्टर द्वारा स्वीकृत" },
  "dash.openLive": { en: "Open live screening", hi: "सजीव जांच खोलें" },
  "dash.emptyQueue": { en: "No cases in this queue", hi: "इस पंक्ति में कोई केस नहीं" },
  "dash.casesSelected": { en: "cases selected", hi: "केस चयनित" },
  "dash.clear": { en: "clear", hi: "साफ़ करें" },
  "dash.selectAll": { en: "Select all signable cases in this lane", hi: "इस पंक्ति के सभी साइन-ऑफ़ योग्य केस चुनें" },
  "dash.sortBy": { en: "Sort by {col}", hi: "{col} के अनुसार क्रमित करें" },

  // ── camp-day register filter ────────────────────────────────
  "dash.day.group": { en: "Filter the register by camp day", hi: "कैंप दिवस के अनुसार रजिस्टर छानें" },
  "dash.day.all": { en: "All days", hi: "सभी दिन" },
  "dash.day.tab": { en: "Day {n}", hi: "दिन {n}" },
  "dash.day.count": { en: "{n} case{s}", hi: "{n} केस" },
  "dash.day.print": { en: "Camp day: {day}", hi: "कैंप दिवस: {day}" },

  // ── reviewing doctor picker ─────────────────────────────────
  "dash.doctor.label": { en: "Reviewing doctor", hi: "समीक्षक डॉक्टर" },
  "dash.doctor.title": {
    en: "Recorded as the signer on every sign-off — saved on this device",
    hi: "हर साइन-ऑफ़ पर साइनर के रूप में दर्ज — इस डिवाइस पर सुरक्षित",
  },

  // ── activity filter chips ───────────────────────────────────
  "dash.activity.filterGroup": { en: "Filter decisions by type", hi: "प्रकार के अनुसार निर्णय छानें" },
  "dash.activity.noneMatch": {
    en: "No events of this type in the recorded decisions",
    hi: "दर्ज निर्णयों में इस प्रकार की कोई घटना नहीं",
  },

  "dash.toast.signed": { en: "Signed off by {by} — saved to the register", hi: "{by} द्वारा साइन-ऑफ़ — रजिस्टर में सुरक्षित" },
  "dash.toast.signFail": { en: "Sign-off failed — try again", hi: "साइन-ऑफ़ विफल — फिर प्रयास करें" },
  "dash.toast.reopened": { en: "Case reopened — returned to the {lane} queue", hi: "केस पुनः खोला गया — {lane} पंक्ति में वापस" },
  "dash.toast.reopenFail": { en: "Reopen failed — try again", hi: "पुनः खोलना विफल — फिर प्रयास करें" },
  "dash.toast.bulkSigned": { en: "{n} cases signed off — saved to the register", hi: "{n} केस साइन-ऑफ़ — रजिस्टर में सुरक्षित" },
  "dash.toast.bulkSignedOne": { en: "1 case signed off — saved to the register", hi: "1 केस साइन-ऑफ़ — रजिस्टर में सुरक्षित" },
  "dash.toast.bulkFail": { en: "{n} cases couldn't be signed — {first}", hi: "{n} केस साइन नहीं हो सके — {first}" },
  "dash.toast.bulkFailOne": { en: "1 case couldn't be signed — {first}", hi: "1 केस साइन नहीं हो सका — {first}" },
  "dash.toast.bulkFailApi": { en: "Bulk sign-off failed — try again", hi: "बल्क साइन-ऑफ़ विफल — फिर प्रयास करें" },
  "dash.toast.noSigned": {
    en: "No signed-off cases yet — approve a case first to build the register",
    hi: "अभी कोई साइन-ऑफ़ केस नहीं — रजिस्टर बनाने के लिए पहले कोई केस स्वीकृत करें",
  },
  "dash.toast.registerPdf": { en: "Register PDF generated — {n} signed case{s}", hi: "रजिस्टर PDF बना — {n} साइन-ऑफ़ केस" },

  // ── register activity timeline ──────────────────────────────
  "dash.activity.title": { en: "Register activity", hi: "रजिस्टर गतिविधि" },
  "dash.activity.sub": {
    en: "Every sign-off, reopen and routing decision — newest first",
    hi: "हर साइन-ऑफ़, पुनः-खोलना और रूटिंग निर्णय — नवीनतम पहले",
  },
  "dash.activity.refresh": { en: "Refresh activity", hi: "गतिविधि रिफ्रेश करें" },
  "dash.activity.empty": {
    en: "No decisions recorded yet — sign off a case to start the trail",
    hi: "अभी कोई निर्णय दर्ज नहीं — ट्रेल शुरू करने के लिए कोई केस साइन-ऑफ़ करें",
  },
  "dash.activity.error": { en: "Couldn't load activity", hi: "गतिविधि लोड नहीं हुई" },
  "dash.activity.signed": { en: "Signed off", hi: "साइन-ऑफ़" },
  "dash.activity.reopened": { en: "Reopened", hi: "पुनः खोला" },
  "dash.activity.routed": { en: "Routed", hi: "रूट हुआ" },
  "dash.activity.showing": { en: "Latest {n} of {total} recorded decisions", hi: "दर्ज {total} निर्णयों में से नवीनतम {n}" },
  "dash.activity.openCase": { en: "Open case report", hi: "केस रिपोर्ट खोलें" },
  "dash.activity.all": { en: "All", hi: "सभी" },
  "dash.activity.filtered": {
    en: "{n} {type} event{s} shown · {total} recorded",
    hi: "दर्ज {total} निर्णयों में से {n} {type} घटनाएं",
  },

  // ── bulk sign-off note ──────────────────────────────────────
  "dash.bulk.noteLabel": { en: "Note for the audit trail (optional)", hi: "ऑडिट ट्रेल के लिए नोट (वैकल्पिक)" },
  "dash.bulk.notePlaceholder": {
    en: "e.g. Both eyes checked — refer to district hospital next month",
    hi: "जैसे: दोनों आंखें जांची — अगले महीने जिला अस्पताल भेजें",
  },

  // ── print register ──────────────────────────────────────────
  "dash.print": { en: "Print register", hi: "रजिस्टर प्रिंट करें" },
  "dash.print.title": { en: "DRISHTI — Screening day register", hi: "DRISHTI — जांच दिवस रजिस्टर" },
  "dash.print.generated": { en: "Generated {date}", hi: "निर्मित {date}" },
  "dash.print.doctor": { en: "Reviewing doctor: {name}", hi: "समीक्षक डॉक्टर: {name}" },
  "dash.print.page": { en: "Page {n}", hi: "पृष्ठ {n}" },

  // ── screening ────────────────────────────────────────────────
  "screen.eyebrow": { en: "LIVE SCREENING", hi: "सजीव जांच" },
  "screen.title.a": { en: "Upload a retina. ", hi: "रेटिना अपलोड करें। " },
  "screen.title.b": { en: "Watch DRISHTI think.", hi: "DRISHTI की सोच देखिए।" },
  "screen.sub": {
    en: "Quality gate → evidence → grading → Grad-CAM → trust routing — every stage animates exactly like the real console.",
    hi: "गुणवत्ता गेट → साक्ष्य → ग्रेडिंग → Grad-CAM → भरोसा रूटिंग — हर चरण असली कंसोल जैसा दिखता है।",
  },
  "screen.trustScore": { en: "Trust score", hi: "भरोसा स्कोर" },
  "screen.quality": { en: "Quality", hi: "गुणवत्ता" },
  "screen.consistency": { en: "Consistency", hi: "संगति" },
  "screen.sendReview": { en: "Send to review queue", hi: "समीक्षा पंक्ति में भेजें" },
  "screen.toastQueued": { en: "Queued for ophthalmologist sign-off", hi: "नेत्र विशेषज्ञ साइन-ऑफ़ के लिए कतार में" },
  "screen.pdf": { en: "Download report PDF", hi: "रिपोर्ट PDF डाउनलोड करें" },
  "screen.new": { en: "New screening", hi: "नई जांच" },
  "screen.registerStrip": { en: "From the register — tap to re-run", hi: "रजिस्टर से — दोबारा चलाने हेतु टैप करें" },
  "screen.haltedBanner": {
    en: "Quality gate halted the pipeline — no AI grade was produced.",
    hi: "गुणवत्ता गेट ने पाइपलाइन रोक दी — कोई AI ग्रेड नहीं बना।",
  },
  "screen.haltedTitle": { en: "Quality gate halted the pipeline", hi: "गुणवत्ता गेट ने पाइपलाइन रोक दी" },
  "screen.live": { en: "LIVE", hi: "सजीव" },
  "screen.start": { en: "Start screening", hi: "जांच शुरू करें" },
  "screen.running": { en: "Running…", hi: "चल रहा है…" },
  "screen.report": { en: "Clinical report", hi: "नैदानिक रिपोर्ट" },

  // ── report modal (dashboard) internals ──────────────────────
  "leg.vessels": { en: "Vessels", hi: "वाहिकाएं" },
  "dash.cnnTop3": { en: "Class probabilities — top 3", hi: "क्लास प्रायिकताएं — शीर्ष 3" },
  "dash.gradcamNote": {
    en: "Grad-CAM highlights the regions that drove the CNN decision — the model attends to lesions, not artifacts.",
    hi: "Grad-CAM उन क्षेत्रों को उजागर करता है जहाँ से CNN को निर्णय मिला — मॉडल घावों पर ध्यान देता है, छवि-दोषों पर नहीं।",
  },
  "dash.gateFailed": { en: "Image failed the quality gate", hi: "छवि गुणवत्ता गेट में विफल रही" },
  "dash.dmeFlagged": { en: "DME risk flagged", hi: "DME जोखिम चिह्नित" },
  "dash.demoCase": { en: "Demo data — simulated case", hi: "डेमो डेटा — नमूना केस" },

  // ── per-case audit history (report modal) ────────────────
  "dash.caseAudit.title": { en: "Case audit history", hi: "केस ऑडिट इतिहास" },
  "dash.caseAudit.empty": {
    en: "No decisions recorded yet — sign-offs and reopens will appear here",
    hi: "अभी कोई निर्णय दर्ज नहीं — साइन-ऑफ़ और पुनः-खोलना यहाँ दिखेंगे",
  },

  // ── clinical report card (screening + shared labels) ─────────
  "screen.aiGrade": { en: "AI grade", hi: "AI ग्रेड" },
  "screen.confidence": { en: "Confidence", hi: "आत्मविश्वास" },
  "screen.centroid": { en: "Centroid distance", hi: "सेंट्रॉइड दूरी" },
  "screen.regionOverlap": { en: "Region overlap", hi: "क्षेत्र ओवरलैप" },
  "ev.ma": { en: "Microaneurysms", hi: "माइक्रोएन्यूरिज्म" },
  "ev.hem": { en: "Hemorrhages", hi: "रक्तस्राव" },
  "ev.ex": { en: "Exudates", hi: "एक्सूडेट्स" },
  "ev.vessel": { en: "Vessel density", hi: "वाहिका घनत्व" },
  "screen.cnnProbs": { en: "CNN probabilities — ICDR 0–4", hi: "CNN प्रायिकताएं — ICDR 0–4" },
  "screen.referralTimeline": { en: "Referral timeline", hi: "रेफरल समय-रेखा" },
  "screen.rt.screened": { en: "Screened today", hi: "आज जांचा गया" },
  "screen.rt.graded": { en: "Grade + trust assigned", hi: "ग्रेड + भरोसा निर्धारित" },
  "screen.rt.conf": { en: "confidence", hi: "आत्मविश्वास" },
  "screen.rt.trustDetail": { en: "Trust score {s} · {level} trust", hi: "भरोसा स्कोर {s} · {level} भरोसा" },
  "screen.rt.policy": {
    en: "ICDR referral policy — DRISHTI never auto-clears on low trust",
    hi: "ICDR रेफरल नीति — DRISHTI कम भरोसे पर कभी स्वतः स्वीकृत नहीं करता",
  },
  "trustLevel.HIGH": { en: "HIGH", hi: "उच्च" },
  "trustLevel.MODERATE": { en: "MODERATE", hi: "मध्यम" },
  "trustLevel.LOW": { en: "LOW", hi: "निम्न" },
  "screen.pipeline": { en: "Pipeline", hi: "पाइपलाइन" },
  "screen.t.gate": { en: "Gate", hi: "गेट" },
  "screen.t.evidence": { en: "Evidence", hi: "साक्ष्य" },
  "screen.t.cnn": { en: "CNN", hi: "CNN" },
  "screen.t.explain": { en: "Explain + Trust", hi: "व्याख्या + भरोसा" },
  "screen.t.total": { en: "Total", hi: "कुल" },
  "icdr.action.0": { en: "Routine re-screen in 12 months", hi: "12 महीने में नियमित दोबारा जांच" },
  "icdr.action.1": { en: "Re-screen in 6-12 months", hi: "6-12 महीने में दोबारा जांच" },
  "icdr.action.2": { en: "Refer within 3-6 months", hi: "3-6 महीने के भीतर रेफर करें" },
  "icdr.action.3": { en: "Refer within 4 weeks", hi: "4 सप्ताह के भीतर रेफर करें" },
  "icdr.action.4": { en: "Urgent referral — within 1 week", hi: "अत्यावश्यक रेफरल — 1 सप्ताह के भीतर" },

  "cap.share": { en: "Copy share link", hi: "शेयर लिंक कॉपी करें" },
  "cap.shareCopied": { en: "Share link copied — config travels in the URL", hi: "शेयर लिंक कॉपी हो गया — कॉन्फ़िग URL में है" },
  "cap.shareFailed": { en: "Could not copy — copy the URL from the address bar", hi: "कॉपी नहीं हुआ — एड्रेस बार से URL कॉपी करें" },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** translate by key; {var} placeholders replaced from `vars` */
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** Replace {placeholders} in a translated string. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k, v) => interpolate(DICT[k]?.en ?? k, v) });

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

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = DICT[key]?.[lang] ?? DICT[key]?.en ?? key;
      return interpolate(template, vars);
    },
    [lang]
  );

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
