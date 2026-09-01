import { NextResponse } from "next/server";
import {
  VALIDATED_METRICS,
  CONFUSION_MATRIX,
  THRESHOLD_CURVE,
  TRAINING_CURVES,
  GRADCAM_GALLERY,
} from "@/lib/drishti";

export const runtime = "nodejs";

/** GET /api/metrics — APTOS validation numbers + confusion matrix + threshold curve */
export async function GET() {
  return NextResponse.json({
    headline: VALIDATED_METRICS,
    confusion: CONFUSION_MATRIX,
    threshold_curve: THRESHOLD_CURVE,
    training: TRAINING_CURVES,
    gradcam_gallery: GRADCAM_GALLERY,
    source: {
      dataset: "APTOS 2019 blindness detection — Aravind Eye Hospital (Kaggle)",
      vessels: "STARE — Clemson University",
      note: "Validated on 550 held-out images. Research prototype — not a certified clinical device.",
    },
  });
}
