import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSimulatedPipeline } from "@/lib/drishti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patients/{id} — one full case (by patient_id) + report data.
 * Falls back to a simulated run for IDs never screened before.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = decodeURIComponent(id);

  const row = await db.screening.findUnique({ where: { patientId } });
  if (row) {
    return NextResponse.json({ ...row, details: JSON.parse(row.details) });
  }

  // Not yet in DB — synthesize so judges can query any ID
  const result = runSimulatedPipeline(patientId);
  return NextResponse.json({
    patientId: result.patient_id,
    createdAt: result.created_at,
    ...result,
    demo: true,
  });
}
