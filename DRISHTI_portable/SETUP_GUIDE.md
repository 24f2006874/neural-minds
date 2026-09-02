# 🖥️ DRISHTI Setup Guide — Run the Prototype on YOUR Laptop

**Follow these steps exactly. Ask me if anything fails — do NOT guess.**

---

## Step 1: Install Python (10 minutes)

1. Go to **https://www.python.org/downloads/**
2. Download Python **3.11** (or any 3.10+)
3. While installing, **CHECK THE BOX that says "Add Python to PATH"**
   ⚠️ This is the #1 mistake people make — do not skip it!
4. Click Install.

**Check it worked:** open **Command Prompt** (Windows: press `Win + R`, type `cmd`, Enter) and type:
```
python --version
```
You should see something like `Python 3.11.x`.

## Step 2: Download and unzip the DRISHTI package

The package comes as **TWO downloads** (the model was too big to fit in the
zip together with everything else):

1. **DRISHTI_portable.zip** (~20 MB) → download, right-click → **Extract All**
2. **drishti_dr_model.pt** (~45 MB) → download, then **copy it into the
   `models` folder** inside the extracted `DRISHTI_portable` folder
   (a `PUT_MODEL_HERE.txt` file marks the exact spot — delete it after)

Your folder should look like:
```
DRISHTI_portable/
├── models/
│   └── drishti_dr_model.pt   ← the second download goes HERE
├── data/  src/  matlab/  results/  kaggle/
├── run_demo.py  SETUP_GUIDE.md  README.md
```

## Step 3: Install the required libraries (5 minutes)

In Command Prompt, type this ONE line and press Enter (internet needed,
takes a few minutes):

```
pip install opencv-python numpy scipy matplotlib scikit-image torch torchvision --index-url https://pypi.org/simple
```

If `pip` is not found, try `python -m pip install ...` instead.

## Step 4: Run the demo! 🚀

In Command Prompt, go to the folder (adjust the path to yours):

```
cd C:\Users\YourName\Downloads\DRISHTI_portable
python run_demo.py
```

You should see 4 cases run: NORMAL → DR → SEVERE DR → BAD PHOTO (rejected).
Output images appear in the `results/` folder — open them and check!

## Step 5: Run the full pipeline on one patient image

```
python src/pipeline.py data/stare_images/im0001.png --id PATIENT-001
```

This creates the **30-second clinical report**: `results/PATIENT-001_report.png`

## Other useful commands

| Command | What it shows |
|---|---|
| `python src/evaluate_model.py` | Test-set metrics — on the demo laptop it shows the RECORDED metrics (only 16 of the 397 dataset images are in this package) |
| `python src/module5_capacity_planner.py` | Screening capacity what-if table |
| `python src/pipeline.py data/stare_images/im0345.png --id SEVERE-001` | Full report on the severe DR case (best demo case!) |

## Try it with judges' own image

Give ANY retina image (jpg/png) to the pipeline:

```
python src/pipeline.py path\to\any\retina\image.jpg --id JUDGE-TEST
```

16 demo images are in `data/stare_images/` (labels in `data/demo_labels.txt`).

---

## ❓ Common problems

**"python is not recognized"** → You didn't check "Add to PATH" in Step 1.
Reinstall Python and check the box.

**"ModuleNotFoundError: No module named 'cv2'"** → Step 3 didn't finish.
Run it again. If `pip` fails, try `python -m pip install --upgrade pip` first.

**"can't open/read file: check path"** → You're in the wrong folder.
Use `cd` to go where you extracted DRISHTI_portable, or give the full image path.

**Torch install too big/slow?** → For the demo, only the classifier needs
torch. If you can't install it, Modules 1-2 still run without it (quality
gate + lesion detection). Ask me for a fallback plan.

**Everything else** → screenshot the error, send it to me. Don't panic. 😊

---

## 🧮 MATLAB Setup (for the MathWorks part — assign ONE teammate, ~1 hour)

The problem statement is from **MathWorks**, so judges will ask about MATLAB.
Our complete MATLAB implementation is in the `matlab/` folder. Here's how to
run it live:

### M-Step 1: Get MATLAB (check the free options in this order)

1. **Campus license first!** IITM students often get MATLAB free — log in at
   mathworks.com with your **institute email** and check "My Licenses"
2. **No license? Use the free 30-day trial** — full MATLAB, all toolboxes:
   - Go to **mathworks.com** → Sign In → Create Account (use any email)
   - Download the **MATLAB installer** (R2024a or newer)
   - Run it → log in → choose **"MATLAB Trial"** → next
   - At the product selection screen, the trial lets you install EVERYTHING —
     make sure these are ticked:
     - ✅ **MATLAB** (core)
     - ✅ **Image Processing Toolbox**
     - ✅ **Deep Learning Toolbox**
     - ✅ **Computer Vision Toolbox**
     - ✅ **Simulink** + **SimEvents** (for Module 5)
   - Install = 20-40 min (needs ~10 GB free disk space)

### M-Step 2: Run our pipeline (2 minutes)

1. Open MATLAB
2. In the "Current Folder" panel (left side), navigate to the
   `matlab` folder inside `DRISHTI_portable`
3. In the Command Window, run:

```matlab
result = DRISHTI('../data/stare_images/im0345.png', 'SEVERE-001');
```

**What you'll see:** the same 4-module story as the Python version —
Trust Gate decision, lesion counts, DME risk, grade, trust score.

**Note:** without a trained CNN in MATLAB (`.mat` file), DRISHTI
automatically uses the **evidence-based grading path** — vessel/lesion
evidence decides the grade. That's a feature, not a bug: it proves the
pipeline runs end-to-end in MATLAB. Say to judges: *"the CNN weights from
our APTOS training are the Python model; in MATLAB we demonstrate the full
pipeline with evidence-based grading and can train module 3 the same way."*

Try the other cases too:
```matlab
result = DRISHTI('../data/stare_images/im0013.png', 'REVIEW-001');
result = DRISHTI('../data/stare_images/im0032.png', 'NORMAL-001');
```

### M-Step 3: Build the Simulink model (Module 5, 1 minute)

```matlab
module5_build_simulink
```
This automatically creates `DRISHTI_ScreeningFlow` — a Simulink/SimEvents
model of the PHC screening queue (patient arrivals → cameras → AI →
review). It opens in Simulink; press ▶ to simulate. If a parameter warning
appears, set the arrival/service times manually as the message suggests.

### M-Step 4: Train on another dataset (APTOS or IDRiD)

The MATLAB trainer accepts any labelled dataset arranged into five ICDR
folders. Keep training, validation and test images separate:

```
my_dataset/
├── train/Level0/ ... Level4/
├── val/Level0/   ... Level4/
└── test/Level0/  ... Level4/
```

After uploading the dataset to MATLAB Online, run:

```matlab
cd DRISHTI_portable/matlab
[net, info] = module3_train_resnet('../my_dataset', 12);
```

The script performs class-balanced oversampling, augmentation and ResNet-50
transfer learning, then saves `drishti_dr_model.mat` in the current MATLAB
folder. To use it in the main pipeline, keep that file beside `DRISHTI.m` and
run:

```matlab
result = DRISHTI('../my_dataset/test/Level2/example.png', 'DATASET-TEST-001');
```

APTOS and IDRiD labels must use the same Level0–Level4 ICDR convention. Use
one dataset for training and the other as an external test set when measuring
cross-dataset robustness. Do not report new sensitivity or specificity until
the held-out test set has been evaluated.

### M-Step 5: What NOT to do tomorrow ❌

- **Don't** run `module3_train_resnet` live — training takes hours
- **Don't** promise "we trained in MATLAB" — say *"our official training ran
  on a Kaggle T4 GPU (APTOS, ResNet-50); the MATLAB module 3 script does the
  same training with `trainnet` and is ready to run"*

---

## 🎬 Demo-day safety checklist

- [ ] Test the demo on the laptop you'll present from (tonight!)
- [ ] Pre-generated reports are in `results/` as BACKUP if live demo fails
- [ ] Charge laptop + carry charger
- [ ] Open the demo images folder in a second window for quick switching
- [ ] Rehearse the 60-second storyline from DRISHTI_Team_Guide.md (3 times!)
