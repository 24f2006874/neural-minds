import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients/audit — merged audit trail for the register activity feed.
 *
 * Events come from the `audit_log` array persisted inside each row's details
 * JSON (SIGNED / REOPENED / ROUTED). Legacy rows that were signed off before
 * the audit log existed are back-filled from reviewedBy / reviewedAt /
 * reviewNote so the feed is complete on day one.
 *
 * Query: ?limit=40 (1–100, default 40)
 * Response: { count, events: [{ patient_id, action, by, note, at, status, trust_level, grade }] }
 * Sorted newest first.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 40;

  const rows = await db.screening.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      patientId: true,
      status: true,
      trustLevel: true,
      predictedClass: true,
      details: true,
      reviewedBy: true,
      reviewedAt: true,
      reviewNote: true,
    },
  });

  type AuditEvent = {
    patient_id: string;
    action: "SIGNED" | "REOPENED" | "ROUTED";
    by: string;
    note: string;
    at: string;
    status: string;
    trust_level: string;
    grade: string;
  };

  const events: AuditEvent[] = [];

  for (const r of rows) {
    const base = {
      patient_id: r.patientId,
      trust_level: r.trustLevel ?? "—",
      grade: r.predictedClass ?? "—",
    };

    let logged: AuditEvent[] = [];
    try {
      const parsed = JSON.parse(r.details ?? "null") as { audit_log?: unknown } | null;
      if (parsed && Array.isArray(parsed.audit_log)) {
        logged = parsed.audit_log
          .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
          .map((e) => ({
            patient_id: base.patient_id,
            action: (e.action === "SIGNED" || e.action === "REOPENED" || e.action === "ROUTED"
              ? e.action
              : "ROUTED") as AuditEvent["action"],
            by: String(e.by ?? "—").slice(0, 80),
            note: String(e.note ?? "").slice(0, 400),
            at: String(e.at ?? ""),
            status: String(e.status ?? r.status),
            trust_level: base.trust_level,
            grade: base.grade,
          }))
          .filter((e) => !Number.isNaN(new Date(e.at).getTime()));
      }
    } catch {
      // unparseable details → fall through to the legacy back-fill
    }

    // Legacy back-fill: rows signed off before audit_log existed.
    const hasSignedEvent = logged.some((e) => e.action === "SIGNED");
    if (!hasSignedEvent && r.reviewedBy && r.reviewedAt) {
      logged = [
        ...logged,
        {
          patient_id: base.patient_id,
          action: "SIGNED",
          by: r.reviewedBy.slice(0, 80),
          note: (r.reviewNote ?? `Signed off by ${r.reviewedBy}`).slice(0, 400),
          at: new Date(r.reviewedAt).toISOString(),
          status: "AUTO_CLEARED",
          trust_level: base.trust_level,
          grade: base.grade,
        },
      ];
    }

    events.push(...logged);
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({ count: events.length, events: events.slice(0, limit) });
}
