import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["AUTO_CLEARED", "NEEDS_REVIEW", "URGENT", "REJECTED"]);

/** Append an event to the details-JSON audit_log (best-effort — never blocks the write). */
function withAuditEvent(details: string, status: string, event: Record<string, unknown>): string {
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const log = Array.isArray(parsed.audit_log) ? parsed.audit_log : [];
    parsed.audit_log = [...log, event].slice(-20); // keep the last 20 events per case
    parsed.status = status;
    return JSON.stringify(parsed);
  } catch {
    return details; // keep original details if unparseable
  }
}

/**
 * PATCH /api/patients/{id}/status — doctor sign-off / routing override.
 * Body: { status, reviewed_by, note? }
 * Persists the human-in-the-loop decision with an audit trail
 * (reviewedBy / reviewedAt / reviewNote) and syncs the embedded details JSON.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = decodeURIComponent(id);

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "");
  const reviewedBy = String(body?.reviewed_by ?? "Dr. Review").slice(0, 80);
  const note = body?.note ? String(body.note).slice(0, 400) : null;

  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: `status must be one of ${[...ALLOWED].join(", ")}` }, { status: 400 });
  }

  const row = await db.screening.findUnique({ where: { patientId } });
  if (!row) {
    return NextResponse.json({ error: `patient ${patientId} not found` }, { status: 404 });
  }

  // Guard: REJECTED cases stay rejected — there is nothing to sign off
  if (row.status === "REJECTED") {
    return NextResponse.json({ error: "REJECTED cases cannot be signed off" }, { status: 409 });
  }

  // Sync the embedded ScreeningResult so exports / report PDFs stay consistent,
  // and append a structured audit_log event (SIGNED / REOPENED / ROUTED).
  const wasSigned = Boolean(row.reviewedBy);
  const action = status === "AUTO_CLEARED" ? "SIGNED" : wasSigned ? "REOPENED" : "ROUTED";
  const eventNote =
    note ??
    (action === "SIGNED"
      ? `Signed off by ${reviewedBy}`
      : action === "REOPENED"
        ? `Sign-off reopened by ${reviewedBy} — case returned to the ${status === "URGENT" ? "urgent" : "review"} queue`
        : `Case routed to ${status} by ${reviewedBy}`);
  const details = withAuditEvent(row.details, status, {
    at: new Date().toISOString(),
    action,
    by: reviewedBy,
    note: eventNote,
    status,
  });

  const updated = await db.screening.update({
    where: { patientId },
    data: {
      status,
      details,
      reviewedBy: status === "AUTO_CLEARED" ? reviewedBy : null,
      reviewedAt: status === "AUTO_CLEARED" ? new Date() : null,
      reviewNote: action === "SIGNED" && !note ? `Signed off by ${reviewedBy}` : note,
    },
  });

  return NextResponse.json({
    ok: true,
    patient_id: updated.patientId,
    status: updated.status,
    reviewed_by: updated.reviewedBy,
    reviewed_at: updated.reviewedAt,
    review_note: updated.reviewNote,
  });
}
