"""
DRISHTI — MATLAB setup helper (run AFTER installing MATLAB)
===========================================================
Run this once after MATLAB + the MATLAB Engine for Python are installed:

    python setup_matlab.py

It will:
  1. Confirm the `matlabengine` Python package is installed
  2. Boot the MATLAB Engine and add DRISHTI_portable/matlab to the path
  3. Check `DRISHTI.m` is callable (module 1..5 present)
  4. Try to build the Simulink capacity model (needs Simulink + SimEvents)
  5. Print final status so you know the webapp will flip to "MATLAB active"

Prereqs:
  - MATLAB installed (student/university license) with:
      Simulink, SimEvents, Image Processing, Computer Vision,
      Deep Learning, Statistics & Machine Learning Toolboxes
  - pip install matlabengine
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MATLAB_SRC = HERE.parent / "DRISHTI_portable" / "matlab"


def main() -> int:
    print("=" * 62)
    print("DRISHTI MATLAB setup verifier")
    print("=" * 62)

    # 1) Python package
    try:
        import matlab.engine  # noqa: F401
        print(f"[1/5] matlabengine package .......... OK")
    except Exception as e:
        print(f"[1/5] matlabengine package .......... MISSING")
        print(f"      Run:  python -m pip install matlabengine")
        print("      (install MATLAB first if the pip step fails)")
        return 1

    # 2) Boot engine
    try:
        eng = matlab.engine.start_matlab()
        print("[2/5] MATLAB engine spawn .......... OK")
    except Exception as e:
        print(f"[2/5] MATLAB engine spawn .......... FAILED: {e}")
        print("      Is MATLAB installed and activated?")
        return 1

    # 3) Add source path + entry point
    try:
        if MATLAB_SRC.exists():
            eng.addpath(str(MATLAB_SRC), nargout=0)
        ok = bool(eng.exist("DRISHTI"))
        print(f"[3/5] DRISHTI.m callable ........... {'OK' if ok else 'NOT FOUND'}")
        if not ok:
            print(f"      Check: {MATLAB_SRC} contains DRISHTI.m")
            return 1
    except Exception as e:
        print(f"[3/5] DRISHTI.m callable ........... ERROR: {e}")
        return 1

    # 4) Module dependency report
    for m in ["module1_quality_gate", "module2_evidence_engine",
              "module3_train_resnet", "module4_explainability",
              "module5_build_simulink"]:
        try:
            present = bool(eng.exist(m))
            print(f"      {m:28s} {'present' if present else 'MISSING'}")
        except Exception:
            pass

    # 5) Simulink model build (best-effort)
    try:
        eng.eval("module5_build_simulink", nargout=0)
        print("[5/5] Simulink capacity model ...... built (DRISHTI_CapacityPlanner.slx)")
    except Exception as e:
        print(f"[5/5] Simulink capacity model ...... skipped: {e}")
        print("      (needs Simulink + SimEvents; not fatal for screening)")

    print("-" * 62)
    print("DONE. The web app will now report 'MATLAB Engine active'.")
    print("Restart the backend and refresh the site to verify.")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
