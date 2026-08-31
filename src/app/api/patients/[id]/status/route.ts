import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["AUTO_CLEARED", "NEEDS_REVIEW", "URGENT", "REJECTED"]);

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

  // Sync the embedded ScreeningResult so exports / report PDFs stay consistent
  let details = row.details;
  try {
    const parsed = JSON.parse(row.details);
    parsed.status = status;
    details = JSON.stringify(parsed);
  } catch {
    // keep original details if unparseable
  }

  const updated = await db.screening.update({
    where: { patientId },
    data: {
      status,
      details,
      reviewedBy: status === "AUTO_CLEARED" ? reviewedBy : null,
      reviewedAt: status === "AUTO_CLEARED" ? new Date() : null,
      reviewNote: note,
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
