# DRISHTI — Trust-Gated Explainable AI for Diabetic Retinopathy Screening

**SIH 2026 | Problem Statement 26038 (MathWorks) | MedTech / BioTech / HealthTech**

DRISHTI screens rural patients for diabetic retinopathy (DR) with AI that
**shows AND validates** its reasoning — so ophthalmologists can trust it.

---

## What's in this folder

```
drishti/
├── README.md                  <- you are here
├── run_demo.py                <- ONE-CLICK demo (4 showcase cases)
├── data/
│   ├── stare_images/          <- 397 real retina images (STARE dataset, free)
│   └── all-mg-codes.txt       <- doctor's diagnosis for every image
├── src/                       <- THE PROTOTYPE (Python, tested & working)
│   ├── module1_quality_gate.py      Trust Gate: quality + enhancement
│   ├── module2_evidence_engine.py   Vessels, optic disc, fovea, lesions, DME
│   ├── train_model.py               CNN training (transfer learning)
│   ├── evaluate_model.py            Honest test-set metrics
│   ├── module4_explainability.py    Grad-CAM + Consistency Check + Trust
│   ├── module5_capacity_planner.py  Screening capacity simulation
│   ├── pipeline.py                  Full pipeline -> 30-sec clinical report
│   └── visualize.py                 Clinical visualization panels
├── matlab/                    <- THE MATLAB IMPLEMENTATION (for SIH finale)
│   ├── DRISHTI.m                    Main pipeline (all modules)
│   ├── module1_quality_gate.m
│   ├── module2_evidence_engine.m
│   ├── module3_train_resnet.m       ResNet-50 training on APTOS/IDRiD
│   ├── module4_explainability.m     gradCAM + consistency check
│   └── module5_build_simulink.m     Builds the SimEvents model programmatically
├── models/
│   └── drishti_dr_model.pt    <- trained CNN (created by train_model.py)
└── results/                   <- generated reports, panels, metrics
```

## Quick start (on any laptop with Python)

```bash
pip install opencv-python numpy scipy matplotlib scikit-image torch torchvision
python3 run_demo.py                                   # 4-case showcase
python3 src/pipeline.py data/stare_images/im0001.ppm --id PATIENT-001
python3 src/evaluate_model.py                         # test-set metrics
python3 src/module5_capacity_planner.py               # capacity what-if table
```

## The 5 modules (what each does)

| # | Module | What it does | Key technique |
|---|--------|--------------|---------------|
| 1 | **Trust Gate** | Accepts / enhances / rejects images with a *specific recapture reason* | Laplacian variance, 8×8 illumination grid, coverage + fill-ratio FOV, CLAHE rescue |
| 2 | **Evidence Engine** | Finds vessels, optic disc, fovea, microaneurysms, hemorrhages, exudates; raises DME flag | Multi-scale Hessian (Sato) vessels, black-hat & top-hat transforms, noise-adaptive thresholds |
| 3 | **DR Grading** | CNN classification (No DR / Referable NPDR / PDR) | ResNet transfer learning + class-balanced loss + augmentation |
| 4 | **Explainability** | Grad-CAM + **Consistency Check** → Trust score → auto or human review | Centroid distance, region overlap, evidence agreement |
| 5 | **Capacity Planner** | District-scale screening simulation & what-if analysis | SimEvents queueing model (+ Python twin for the live demo) |

## Validation status (honest numbers)

- Dataset: STARE (free, 397 images, doctor-labelled) — **train 93 / val 19 / test 19**
- Test-set referable-DR **sensitivity 100%** (13/13 true DR cases found)
- Test-set specificity improved with v3 training (see `results/test_metrics.json`)
- Classical detectors: exudate detection separates DR vs normal strongly
  (mean 7.2 vs 1.2 lesions/image); MA detection is noise-adaptive and tuned
  for evidence reporting, not standalone diagnosis
- **Production path:** the same scripts train on APTOS 2019 + IDRiD
  (links in the problem statement) for full 5-level ICDR grading

## Why MATLAB code is included

The problem statement (by MathWorks) requires a MATLAB-based pipeline.
`matlab/` contains the complete implementation — including a script that
**builds the Simulink/SimEvents capacity model automatically**. The Python
prototype exists to demo anywhere, instantly; algorithms are identical.
