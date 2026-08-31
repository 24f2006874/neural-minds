import { NextRequest, NextResponse } from "next/server";
import { computeCapacity, CAPACITY_PRESETS, CAPACITY_PARAMS, districtScaling } from "@/lib/drishti";

export const runtime = "nodejs";

/**
 * GET /api/capacity?cams=3&revw=2&arr=25
 * M/M/c queue math mirroring module5_capacity_planner.py
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cams = clampInt(sp.get("cams"), 1, 10, 3);
  const revw = clampInt(sp.get("revw"), 1, 6, 2);
  const arr = clampInt(sp.get("arr"), 10, 60, 25);

  const result = computeCapacity({ cams, revw, arr });
  return NextResponse.json({
    input: { cams, revw, arr },
    output: result,
    params: CAPACITY_PARAMS,
    presets: CAPACITY_PRESETS,
    scaling: districtScaling(cams, revw, arr),
  });
}

function clampInt(v: string | null, min: number, max: number, dflt: number) {
  const n = parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
