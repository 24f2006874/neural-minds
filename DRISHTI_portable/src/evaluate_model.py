"""
============================================================================
DRISHTI - MODEL EVALUATION: honest test-set metrics
============================================================================
Evaluates the trained model on the HELD-OUT test split (never seen during
training) and reports exactly what the problem statement demands:
    * Sensitivity for referable DR (target > 90%)
    * Specificity for referable DR (target > 85%)
    * Confusion matrix + per-class accuracy
This is the "validation against benchmarks" evidence for judges.
============================================================================
"""

import os
import sys
import json
import numpy as np
import cv2
import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as T

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE, "models", "drishti_dr_model.pt")
SPLIT_PATH = os.path.join(BASE, "models", "test_split.json")
DEVICE = torch.device("cpu")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_model import letterbox, CLASS_NAMES


def load_model():
    model = models.resnet18()
    model.fc = nn.Linear(model.fc.in_features, 3)
    ckpt = torch.load(MODEL_PATH, map_location=DEVICE)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model


def predict(model, img_bgr):
    rgb = cv2.cvtColor(letterbox(img_bgr), cv2.COLOR_BGR2RGB)
    x = T.Compose([T.ToPILImage(), T.ToTensor(),
                   T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])(rgb)
    with torch.no_grad():
        logits = model(x.unsqueeze(0))
        probs = torch.softmax(logits, 1)[0]
    return probs.numpy()


def resolve_test_items():
    """
    Resolve the test split to files that exist on THIS machine.
    The split was recorded on the development sandbox, so paths are made
    relative to this project folder and we also accept .png versions
    (the portable demo package ships 16 showcase images as PNG).
    Returns: list of (path, class) for images that exist.
    """
    with open(SPLIT_PATH) as f:
        test = json.load(f)["test"]
    items = []
    for path, cls in test:
        fname = os.path.basename(path)
        stem = os.path.splitext(fname)[0]
        candidates = [
            os.path.join(BASE, os.path.relpath(path, "/home/user/drishti"))
            if path.startswith("/home/user/drishti") else path,
            os.path.join(BASE, "data", "stare_images", fname),
            os.path.join(BASE, "data", "stare_images", stem + ".png"),
            os.path.join(BASE, "data", "stare_images", stem + ".ppm"),
        ]
        found = next((c for c in candidates if os.path.exists(c)), None)
        if found:
            items.append((found, cls))
    return items, len(test)


def show_recorded_metrics():
    """Laptop fallback: display the metrics recorded during development."""
    rec = os.path.join(BASE, "results", "test_metrics.json")
    print("=" * 64)
    print("RECORDED TEST METRICS (from the development machine)")
    print("=" * 64)
    if os.path.exists(rec):
        with open(rec) as f:
            m = json.load(f)
        print(f"  Test set size        : {m['n_test']} held-out images")
        print(f"  Overall accuracy     : {m['accuracy']*100:.1f}%")
        print(f"  Referable sensitivity: {m['referable_sensitivity']*100:.1f}%")
        print(f"  Referable specificity: {m['referable_specificity']*100:.1f}%")
        print("\n  (Full re-evaluation needs the complete STARE dataset -")
        print("   download: http://cecas.clemson.edu/~ahoover/stare/ -> images/all-images.zip")
        print("   unzip into data/stare_images/ and run this script again.)")
    else:
        print("  results/test_metrics.json not found - run training first.")


def main():
    model = load_model()
    items, total = resolve_test_items()

    if len(items) < total * 0.9:
        print(f"[evaluate] Only {len(items)} of {total} test images are available")
        print("[evaluate] on this machine -> showing RECORDED metrics instead.\n")
        show_recorded_metrics()
        return

    y_true, y_pred, confidences = [], [], []
    for path, cls in items:
        img = cv2.imread(path)
        probs = predict(model, img)
        y_true.append(cls)
        y_pred.append(int(probs.argmax()))
        confidences.append(float(probs.max()))

    y_true, y_pred = np.array(y_true), np.array(y_pred)
    n = len(y_true)
    print("=" * 64)
    print(f"TEST SET: {n} held-out images (never seen in training)")
    print("=" * 64)

    # confusion matrix
    cm = np.zeros((3, 3), int)
    for t, p in zip(y_true, y_pred):
        cm[t, p] += 1
    print("\nConfusion matrix (rows = doctor's label, cols = AI prediction):")
    print(f"{'':>28} {'NoDR':>8} {'NPDR':>8} {'PDR':>8}")
    for i, row in enumerate(cm):
        name = CLASS_NAMES[i].split(" (")[0]
        print(f"{name:>28} {row[0]:>8} {row[1]:>8} {row[2]:>8}")

    # overall accuracy
    acc = (y_true == y_pred).mean()
    print(f"\nOverall accuracy: {acc*100:.1f}%")

    # REFERABLE DR (the clinically critical metric): classes 1,2 vs 0
    ref_true = (y_true >= 1)
    ref_pred = (y_pred >= 1)
    tp = int(((ref_true) & (ref_pred)).sum())
    fn = int(((ref_true) & (~ref_pred)).sum())
    tn = int(((~ref_true) & (~ref_pred)).sum())
    fp = int(((~ref_true) & (ref_pred)).sum())
    sens = tp / (tp + fn) if (tp + fn) else 0.0
    spec = tn / (tn + fp) if (tn + fp) else 0.0
    print("\n" + "=" * 64)
    print("REFERABLE DR DETECTION (PS target: sensitivity>90%, specificity>85%)")
    print("=" * 64)
    print(f"  Sensitivity : {sens*100:.1f}%   (found {tp} of {tp+fn} true DR cases)")
    print(f"  Specificity : {spec*100:.1f}%   (correctly cleared {tn} of {tn+fp} normals)")
    print(f"  Confusion   : {fp} false referrals, {fn} missed DR cases")
    print(f"  Mean confidence: {np.mean(confidences)*100:.1f}%")

    results = {
        "n_test": n, "accuracy": round(float(acc), 3),
        "referable_sensitivity": round(float(sens), 3),
        "referable_specificity": round(float(spec), 3),
        "confusion_matrix": cm.tolist(),
        "class_names": CLASS_NAMES,
    }
    out = os.path.join(BASE, "results", "test_metrics.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved -> results/test_metrics.json")


if __name__ == "__main__":
    main()
