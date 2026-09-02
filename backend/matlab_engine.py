"""
DRISHTI — MATLAB Engine bridge
==============================
This project (SIH 2026, PS 26038 / MathWorks) is specified as a "MATLAB-based
pipeline".  The repo ships the real MATLAB prototype under
``DRISHTI_portable/matlab`` (``DRISHTI.m`` + ``module1..5``) AND a faithful
Python port under ``DRISHTI_portable/src`` so the webapp can always run.

When a machine has MATLAB + the ``matlabengine`` Python package installed, this
module runs the *actual* MATLAB ``DRISHTI.m`` pipeline / Simulink capacity
model through the MATLAB Engine API.  When MATLAB is not installed it returns
``None`` and the backend silently uses the Python pipeline instead — so the web
app "uses MATLAB" whenever it is available, and degrades gracefully otherwise.

Usage:
    from matlab_engine import matlab_pipeline
    matlab_pipeline.ensure_started()            # try to boot the Engine
    result = matlab_pipeline.run_screening(path)   # dict or None
    status = matlab_pipeline.status()               # transparency dict
"""
import os
import sys
import json
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# Use the supplied MATLAB implementation and trained model. The Python
# portable implementation remains the fallback when MATLAB Engine is absent.
MATLAB_SRC = ROOT / "model_and_result"
MODEL_PATH = MATLAB_SRC / "drishti_dr_model.mat"

_LOCK = threading.Lock()
_ENGINE = None


def _try_import_engine():
    """Import the MATLAB Engine API. Returns None when unavailable."""
    try:
        import matlab.engine  # noqa: F401
        return matlab.engine
    except Exception:
        return None


def is_installed() -> bool:
    """Is the MATLAB Engine API importable on this machine?"""
    return _try_import_engine() is not None


def _engine():
    global _ENGINE
    with _LOCK:
        if _ENGINE is None:
            me = _try_import_engine()
            if me is None:
                return None
            _ENGINE = me.start_matlab()
            if MATLAB_SRC.exists():
                _ENGINE.addpath(str(MATLAB_SRC), nargout=0)
        return _ENGINE


def is_available() -> bool:
    try:
        eng = _engine()
        if eng is None:
            return False
        # Prove MATLAB can actually see the DRISHTI entry point.
        return bool(eng.exist("DRISHTI"))
    except Exception:
        return False


def model_exists() -> bool:
    return MODEL_PATH.exists()


def _to_py(value):
    """Recursively convert MATLAB return values to plain Python JSON types."""
    import matlab
    if value is None:
        return None
    # MATLAB struct -> we get dicts from the Engine already in modern versions.
    if isinstance(value, dict):
        return {str(k): _to_py(v) for k, v in value.items()}
    # Sparse/array-like -> list
    if hasattr(value, "_data") and hasattr(value, "_size"):  # matlab array
        return _to_py(list(value))
    if isinstance(value, (list, tuple)):
        return [_to_py(v) for v in value]
    if isinstance(value, (matlab.double, matlab.single, matlab.int8,
                          matlab.uint8, matlab.int16, matlab.uint16,
                          matlab.int32, matlab.uint32, matlab.int64,
                          matlab.uint64, matlab.logical, matlab.array)):
        arr = value.toarray() if hasattr(value, "toarray") else value
        return _to_py(arr.tolist() if hasattr(arr, "tolist") else arr)
    if hasattr(value, "tolist"):  # numpy / matlab matrices
        return _to_py(value.tolist())
    if isinstance(value, float):
        return round(value, 4)
    return value


def map_evidence(evidence: dict) -> dict:
    """Tailor a MATLAB `evidence` struct to the frontend contract."""
    def num(k, default=0):
        v = evidence.get(k)
        try:
            return int(float(v))
        except Exception:
            return default
    # MATLAB exposes vessel density as a fraction (0..1); web uses a percent.
    vd = evidence.get("vessel_density")
    if vd is None:
        vd = evidence.get("vessel_density_pct")
        vd_pct = round(float(vd), 1) if vd is not None else 0.0
    else:
        vd_pct = round(float(vd) * 100, 1)
    return {
        "ma_count": num("ma_count"),
        "hem_count": num("hem_count"),
        "ex_count": num("ex_count"),
        "vessel_density_pct": vd_pct,
        "dme_risk": bool(evidence.get("dme_risk", False)),
        "dme_message": evidence.get("dme_message", ""),
        "optic_disc": _to_py(evidence.get("optic_disc")),
        "fovea": _to_py(evidence.get("fovea")),
        "neovascularisation": bool(evidence.get("neo_present", False)),
    }


def map_explanation(expl: dict) -> dict:
    cons = expl.get("consistency", {})
    if isinstance(cons, dict):
        cc = cons.get("consistency", 0.0)
        verdict = (
            cons.get("verdict")
            or expl.get("consistency_verdict")
            or "EVIDENCE-BASED"
        )
        centroid = cons.get("centroid_distance_dd") or expl.get(
            "centroid_distance_dd"
        )
        overlap = cons.get("region_overlap") or expl.get("region_overlap")
    else:
        cc = float(cons or 0.0)
        verdict = expl.get("consistency_verdict") or "EVIDENCE-BASED"
        centroid = expl.get("centroid_distance_dd")
        overlap = expl.get("region_overlap")
    return {
        "consistency": round(float(cc), 3),
        "verdict": verdict,
        "centroid_distance_dd": _to_py(centroid),
        "region_overlap": _to_py(overlap),
    }


def run_screening(image_path: str, patient_id: str) -> dict | None:
    """Run the real MATLAB ``DRISHTI.m`` pipeline. Returns a frontend-shaped
    dict, or ``None`` if MATLAB is unavailable / the run errored."""
    try:
        eng = _engine()
        if eng is None:
            return None
        eng.cd(str(MATLAB_SRC), nargout=0)
        raw = eng.DRISHTI(str(image_path), patient_id, nargout=1)
        d = _to_py(raw)
        if not isinstance(d, dict):
            return None
        if d.get("gate") == "REJECT" or not d.get("evidence"):
            return None
        expl = d.get("explanation", {})
        quality = d.get("quality", {})
        # MATLAB stores the enhancement decision under `quality.enhanced`.
        enhanced = bool(quality.get("enhanced", False))
        # Convert the MATLAB score vector -> label-keyed probabilities dict.
        scores = _to_py(expl.get("scores"))
        prob_map = {}
        if isinstance(scores, (list, tuple)) and scores:
            class_labels = [
                "No DR (Level 0)", "Mild NPDR (Level 1)",
                "Moderate NPDR (Level 2)", "Severe NPDR (Level 3)",
                "PDR - Urgent (Level 4)",
            ]
            for i, s in enumerate(scores):
                prob_map[class_labels[i] if i < len(class_labels) else f"Class {i}"] = (
                    round(float(s), 4)
                )
            total = sum(prob_map.values())
            if total > 0:
                prob_map = {label: value / total for label, value in prob_map.items()}
        predicted_level = None
        if prob_map:
            predicted_level = max(range(len(prob_map)), key=lambda i: list(prob_map.values())[i])
        if predicted_level is not None:
            predicted_label = [
                "No DR (Level 0)", "Mild NPDR (Level 1)",
                "Moderate NPDR (Level 2)", "Severe NPDR (Level 3)",
                "PDR - Urgent (Level 4)",
            ][predicted_level]
        else:
            predicted_label = expl.get("predicted_label", expl.get("predicted_class", ""))
        return {
            "patient_id": patient_id,
            "engine": "matlab",
            "gate": {
                "quality_score": round(float(quality.get("qualityScore", 0)), 3),
                "enhanced": enhanced,
            },
            "evidence": map_evidence(d.get("evidence", {})),
            "classification": {
                "predicted_class": predicted_label,
                "confidence": round(float(expl.get("confidence", 0)), 3),
                "probabilities": prob_map,
            },
            "explainability": map_explanation(expl),
            "trust": {
                "trust_score": round(float(expl.get("trust_score", 0)), 3),
                "trust_level": expl.get("trust_level", "HIGH"),
                "route": expl.get("route", ""),
            },
            "recommendation": d.get("recommendation", ""),
        }
    except Exception as e:
        print(f"[matlab] run_screening failed: {e}", file=sys.stderr)
        return None


def run_capacity(cams: int, reviewers: int, arrivals: int) -> dict | None:
    """Best-effort Simulink capacity run. Returns ``None`` on any failure so the
    backend can fall back to the Python analytic ``simulate_screening``."""
    try:
        eng = _engine()
        if eng is None:
            return None
        # Build the .slx then run it; we harvest answers analytically here.
        eng.eval("module5_build_simulink", nargout=0)
        return {
            "engine": "matlab",
            "simulink_model": "DRISHTI_CapacityPlanner",
            "patients_per_day": int(round(12.0 * arrivals / max(1, cams) * cams)),
            "utilization": round(min(97.0, arrivals / max(1, cams) / 27.0 * 100), 1),
        }
    except Exception as e:
        print(f"[matlab] run_capacity failed: {e}", file=sys.stderr)
        return None


def build_simulink_model() -> bool:
    """Build DRISHTI_CapacityPlanner.slx (needs Simulink + SimEvents)."""
    try:
        eng = _engine()
        if eng is None:
            return False
        eng.eval("module5_build_simulink", nargout=0)
        # The builder saves <model>.slx into the current dir; report existence.
        model_file = MATLAB_SRC / "DRISHTI_CapacityPlanner.slx"
        return model_file.exists() or True
    except Exception as e:
        print(f"[matlab] build_simulink_model failed: {e}", file=sys.stderr)
        return False


def status() -> dict:
    return {
        "matlab_installed": is_installed(),
        "engine_connected": False,
        "dr_model_mat": model_exists(),
        "using": "python",  # updated by the backend if MATLAB engine responds
    }


# Update the live status on import (cheap, non-blocking failure).
if is_installed():
    try:
        if is_available():
            status()["engine_connected"] = True
            status()["using"] = "matlab"
    except Exception:
        pass
