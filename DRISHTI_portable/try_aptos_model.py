"""
============================================================================
DRISHTI - APTOS MODEL TESTER (safe side-demo, does NOT touch the pipeline)
============================================================================
Q: "Can our official APTOS model run here?"
A: Run this script. It loads models/drishti_aptos_resnet50.pt (if you put it
   there) and grades the 16 demo retina images. The main demo pipeline is
   NOT modified in any way.

HOW TO USE (on the demo laptop):
  1. Copy drishti_aptos_resnet50.pt (from the Kaggle output download)
     into the  models/  folder (next to drishti_dr_model.pt)
  2. Run:   python try_aptos_model.py

WHAT YOU SEE:
  - One table row per demo image: true label vs the APTOS model's grade
  - A summary: how many referable cases it caught

NOTE: the APTOS model was trained on modern digital fundus photos; the demo
images are old film scans. Some disagreement is expected and honest to say.
"""
import os
import sys

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "stare_images")
MODEL_PATH = os.path.join(HERE, "models", "drishti_aptos_resnet50.pt")

# 5-class ICDR scale used by the Kaggle notebook
CLASS_NAMES = ["No DR (0)", "Mild NPDR (1)", "Moderate NPDR (2)",
               "Severe NPDR (3)", "Proliferative DR (4)"]
REFERRAL = {0: "routine", 1: "routine (watch)",
            2: "REFER - ophthalmologist", 3: "REFER - urgent",
            4: "REFER - urgent"}

# true labels of our 16 demo images (from data/demo_labels.txt)
TRUE_LABELS = {"normal": "normal", "BDR": "BDR (mild/moderate)",
               "PDR": "PDR (severe)"}


def load_labels():
    labels = {}
    path = os.path.join(HERE, "data", "demo_labels.txt")
    if os.path.exists(path):
        for ln in open(path):
            parts = ln.strip().split()
            if len(parts) == 2:
                labels[parts[0]] = parts[1]
    return labels


def crop_fundus(img_bgr):
    """Cut away the black background so only the retina remains
    (same idea as the Kaggle notebook's crop_fundus)."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    mask = gray > 15
    rows, cols = np.any(mask, 1), np.any(mask, 0)
    if not rows.any() or not cols.any():
        return img_bgr
    r0, r1 = np.where(rows)[0][[0, -1]]
    c0, c1 = np.where(cols)[0][[0, -1]]
    # small margin so we don't cut the retina edge
    r0, c0 = max(r0 - 10, 0), max(c0 - 10, 0)
    r1 = min(r1 + 10, img_bgr.shape[0] - 1)
    c1 = min(c1 + 10, img_bgr.shape[1] - 1)
    return img_bgr[r0:r1 + 1, c0:c1 + 1]


def build_model():
    """ResNet-50 with a 5-class head - exactly like the Kaggle notebook."""
    from torchvision import models
    net = models.resnet50(weights=None)
    net.fc = nn.Linear(net.fc.in_features, 5)
    return net


def main():
    if not os.path.exists(MODEL_PATH):
        print("drishti_aptos_resnet50.pt not found in models/.")
        print("Copy it there first (see instructions at top of this file).")
        return

    print("Loading the official APTOS model (ResNet-50, 5-class)...")
    net = build_model()
    state = torch.load(MODEL_PATH, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    elif hasattr(state, "state_dict"):     # saved as a full model
        state = state.state_dict()
    net.load_state_dict(state)             # strict: fails loudly if wrong file
    net.eval()

    preprocess = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((256, 256)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    labels = load_labels()
    files = sorted(f for f in os.listdir(DATA) if f.endswith(".png"))
    print(f"\nGrading {len(files)} demo images with the APTOS model...\n")
    print(f"{'image':<14} {'true':<20} {'APTOS model says':<24} {'route'}")
    print("-" * 78)

    hits, ref_true, ref_found = 0, 0, 0
    for f in files:
        img = cv2.imread(os.path.join(DATA, f))
        rgb = cv2.cvtColor(crop_fundus(img), cv2.COLOR_BGR2RGB)
        x = preprocess(rgb).unsqueeze(0)
        with torch.no_grad():
            probs = torch.softmax(net(x)[0], dim=0)
        level = int(probs.argmax())
        conf = float(probs[level])
        true_key = labels.get(f, "?")
        true_txt = TRUE_LABELS.get(true_key, true_key)
        is_ref_true = true_key in ("BDR", "PDR")
        is_ref_pred = level >= 2
        ref_true += is_ref_true
        ref_found += is_ref_true and is_ref_pred
        marker = " " if (is_ref_true == is_ref_pred) else "  <-- mismatch"
        print(f"{f:<14} {true_txt:<20} "
              f"{CLASS_NAMES[level]:<24} {REFERRAL[level]} ({conf*100:.0f}%){marker}")

    print("-" * 78)
    print(f"\nReferable cases caught: {ref_found}/{ref_true}")
    print("\nReminder: these are FILM scans - some mismatch vs the digital-photo")
    print("APTOS training data is expected (domain shift). The main demo keeps")
    print("using the STARE-trained model, whose outputs are already validated.")


if __name__ == "__main__":
    main()
