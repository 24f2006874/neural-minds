import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/patients/bulk-signoff — doctor sign-off for many cases in one action.
 * Body: { patient_ids: string[], reviewed_by?, note? }
 *
 * Per-patient outcome (never fails the whole batch for one bad row):
 *  - unknown ID            → failed entry "not found"
 *  - REJECTED case         → failed entry "REJECTED cases cannot be signed off"
 *  - already signed-off    → failed entry "already signed off by <name>"
 *  - otherwise             → signed: status → AUTO_CLEARED, audit trail recorded,
 *                            embedded details JSON kept in sync.
 * All successful rows are written inside one Prisma transaction.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawIds: unknown = body?.patient_ids;
  const reviewedBy = String(body?.reviewed_by ?? "Dr. Review").slice(0, 80);
  const note = body?.note ? String(body.note).slice(0, 400) : null;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "patient_ids must be a non-empty array" }, { status: 400 });
  }
  const ids = [...new Set(rawIds.map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "patient_ids contains no valid IDs" }, { status: 400 });
  }
  if (ids.length > 50) {
    return NextResponse.json({ error: "bulk sign-off is capped at 50 cases per batch" }, { status: 400 });
  }

  const rows = await db.screening.findMany({
    where: { patientId: { in: ids } },
    select: { id: true, patientId: true, status: true, details: true, reviewedBy: true },
  });
  const byId = new Map(rows.map((r) => [r.patientId, r]));

  const signed: string[] = [];
  const failed: Array<{ patient_id: string; error: string }> = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) failed.push({ patient_id: id, error: "not found in the register" });
    else if (row.status === "REJECTED") failed.push({ patient_id: id, error: "REJECTED cases cannot be signed off" });
    else if (row.reviewedBy) failed.push({ patient_id: id, error: `already signed off by ${row.reviewedBy}` });
    else signed.push(id);
  }

  let reviewedAtIso: string | null = null;

  if (signed.length > 0) {
    const batchNote =
      note ??
      `Bulk sign-off by ${reviewedBy} — ${signed.length} case${signed.length === 1 ? "" : "s"} approved in one action`;
    reviewedAtIso = new Date().toISOString();

    // Sign every valid case inside a single transaction.
    await db.$transaction(
      signed.map((patientId) => {
        const row = byId.get(patientId);
        let details = row?.details ?? null;
        try {
          if (details) {
            const parsed = JSON.parse(details);
            parsed.status = "AUTO_CLEARED";
            details = JSON.stringify(parsed);
          }
        } catch {
          // keep original details if unparseable
        }
        return db.screening.update({
          where: { patientId },
          data: {
            status: "AUTO_CLEARED",
            details: details ?? undefined,
            reviewedBy,
            reviewedAt: new Date(),
            reviewNote: batchNote,
          },
        });
      })
    );
  }

  return NextResponse.json({
    ok: true,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAtIso,
    signed,
    signed_count: signed.length,
    failed,
  });
}
