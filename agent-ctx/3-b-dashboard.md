# Task 3-b — dashboard-view builder (record)

Status: DONE. Only `src/components/views/dashboard-view.tsx` touched.

- Stats cards (4) from GET /api/patients; skeleton-shimmer loading; red retry card on error.
- Filter pills all/auto_cleared/needs_review/urgent/rejected with live counts; per-tab API fetch.
- Desktop shadcn Table (sticky head, 480px scroll) + mobile glass cards; rows open report modal.
- Modal: GET /api/patients/{id} → RetinaView (explicit lesions/gradcam, all layers, REJECTED stamp) + legend, trust/quality/consistency dials, lesion tiles, top-3 ConfBars, DME/gate banner, timing chips, Download PDF (report-pdf), Approve & sign-off (toast + optimistic AUTO_CLEARED flip, override map survives refetch), honesty note.
- Verified headless: counts 3/4/6/4, sign-off flips UI, rejected modal OK, mobile OK. Lint clean for this file.

Wants from others: PATCH /api/patients/{id}/status to persist sign-offs (server currently read-only — sign-off is session-local).
