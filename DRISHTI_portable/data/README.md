# Included demonstration data

This folder contains a small, 16-image STARE demonstration subset used for
local smoke tests and presentation screenshots. The image names and local demo
labels are recorded in `demo_labels.txt`.

It is **not** the full training or test dataset. The `models/test_split.json`
manifest references the original full STARE split and is included only as a
reproducibility record; most of those source images are intentionally not in
this repository.

## Dataset sources

- **STARE**: obtain the complete image collection from the
  [STARE Project](https://cecas.clemson.edu/~ahoover/stare/). Cite the source
  and comply with its terms before redistributing images.
- **APTOS 2019 Blindness Detection**: obtain train/test data directly from the
  [Kaggle competition page](https://www.kaggle.com/competitions/APTOS2019-blindness-detection/data)
  after accepting its competition rules. Do not commit the full data to Git;
  it is about 10 GB.

The model is a research prototype and the sample data must not be used for
clinical decisions.
