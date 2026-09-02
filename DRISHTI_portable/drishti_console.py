"""
============================================================================
DRISHTI CONSOLE - simple desktop UI for the demo (OPTIONAL, zero installs)
============================================================================
WHY THIS IS SAFE:
  - Tkinter is INSIDE Python on Windows (nothing to pip install)
  - It does NOT change the pipeline - it runs the SAME tested command
    (python src/pipeline.py <image> --id <id>) and shows the result
  - If this app ever fails on stage: just close it and use the normal
    commands. Nothing else is affected.

HOW TO RUN (from the DRISHTI_portable folder):
    python drishti_console.py

HOW IT LOOKS:
  [ DRISHTI - DR Screening Console ]        (big title)
  [ Select patient image... ]  -> file picker
  [ Run DRISHTI pipeline    ]  -> runs ~6 s, then shows:
       - verdict panel (grade, confidence, TRUST level color-coded)
       - the full patient report image
  [ Open results folder    ]  -> opens Explorer at results/
============================================================================
"""
import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(HERE, "results")

# colors for the trust levels (green = trusted, amber = review, red = urgent)
TRUST_COLORS = {"HIGH": "#1a7f37", "MODERATE": "#b58a00", "LOW": "#c62828"}


class DrishtiConsole:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("DRISHTI - DR Screening Console | SIH 2026 Neural Minds")
        self.root.geometry("920x760")
        self.image_path = None
        self.result = None          # parsed JSON from the pipeline
        self.report_path = None     # newest report png
        self.photo = None           # keep a reference so the image stays

        # ---------- header ----------
        tk.Label(self.root, text="DRISHTI", font=("Segoe UI", 26, "bold"),
                 fg="#0d3b66").pack(pady=(14, 0))
        tk.Label(self.root,
                 text="Quality-Aware & Explainable AI for Diabetic Retinopathy Screening",
                 font=("Segoe UI", 11), fg="#444444").pack()

        # ---------- buttons row ----------
        bar = tk.Frame(self.root)
        bar.pack(pady=12)
        self.btn_select = tk.Button(bar, text="1. Select patient image...",
                                    font=("Segoe UI", 11), command=self.select_image,
                                    width=22, bg="#e8f0fe")
        self.btn_select.grid(row=0, column=0, padx=6)
        self.btn_run = tk.Button(bar, text="2. Run DRISHTI pipeline",
                                 font=("Segoe UI", 11, "bold"), command=self.start_run,
                                 width=22, bg="#d7f5dd", state=tk.DISABLED)
        self.btn_run.grid(row=0, column=1, padx=6)
        self.btn_folder = tk.Button(bar, text="Open results folder",
                                    font=("Segoe UI", 10), command=self.open_folder,
                                    width=20)
        self.btn_folder.grid(row=0, column=2, padx=6)

        # ---------- status line ----------
        self.status = tk.StringVar(value="Select a retina image to begin.")
        tk.Label(self.root, textvariable=self.status, font=("Segoe UI", 10),
                 fg="#666666").pack()

        # ---------- verdict panel (filled after a run) ----------
        self.verdict = tk.Label(self.root, text="", font=("Segoe UI", 13, "bold"),
                                justify="center", wraplength=860)
        self.verdict.pack(pady=8)

        # ---------- report image (scrollable) ----------
        holder = tk.Frame(self.root)
        holder.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.canvas = tk.Canvas(holder, bg="#f5f5f5", highlightthickness=0)
        scroll = ttk.Scrollbar(holder, orient="vertical", command=self.canvas.yview)
        self.inner = tk.Frame(self.canvas, bg="#f5f5f5")
        self.inner.bind("<Configure>",
                        lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.configure(yscrollcommand=scroll.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        # mouse wheel scrolling
        self.root.bind("<MouseWheel>",
                       lambda e: self.canvas.yview_scroll(int(-e.delta / 120), "units"))

    # ---------- what the buttons do ----------
    def select_image(self):
        path = filedialog.askopenfilename(
            title="Choose a retina photo",
            filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.tif *.tiff"),
                       ("All files", "*.*")])
        if path:
            self.image_path = path
            self.btn_run.config(state=tk.NORMAL)
            self.status.set(f"Selected: {os.path.basename(path)}  -  now press Run.")

    def start_run(self):
        """Run the SAME tested pipeline command in a background thread so
        the window does not freeze, then show the results."""
        if not self.image_path:
            return
        self.btn_run.config(state=tk.DISABLED)
        self.btn_select.config(state=tk.DISABLED)
        self.verdict.config(text="Running DRISHTI pipeline...\n(quality gate -> evidence -> "
                                 "CNN -> Grad-CAM + trust)  ~6 seconds",
                            fg="#666666")
        self.status.set("Working... please wait")
        thread = threading.Thread(target=self.worker, daemon=True)
        thread.start()
        self.root.after(200, self.check_done)

    def worker(self):
        """Background: call the pipeline exactly like the command line does."""
        pid = "UI-" + time.strftime("%H%M%S")
        cmd = [sys.executable, os.path.join(HERE, "src", "pipeline.py"),
               self.image_path, "--id", pid]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  cwd=HERE, timeout=180)
            stdout, stderr = proc.stdout, proc.stderr
        except Exception as exc:                       # e.g. timeout
            self.result, self.report_path = None, None
            self.error_text = str(exc)
            return
        # the pipeline prints the final result as a JSON block - grab it
        idx = stdout.find("{")
        if idx >= 0:
            try:
                self.result = json.loads(stdout[idx:])
            except json.JSONDecodeError:
                self.result = None
        else:
            self.result = None
        self.report_path = os.path.join(RESULTS_DIR, f"{pid}_report.png")
        self.error_text = stderr[-600:] if proc.returncode != 0 else ""

    def check_done(self):
        """Poll until the background thread has finished."""
        if threading.active_count() > 1 and not hasattr(self, "_running_done"):
            # still working? simple check: thread alive
            for t in threading.enumerate():
                if t is not threading.current_thread() and t.is_alive():
                    self.root.after(200, self.check_done)
                    return
        self.finish_run()

    def finish_run(self):
        self.btn_select.config(state=tk.NORMAL)
        if getattr(self, "error_text", "") or self.result is None:
            self.status.set("Pipeline error - see message.")
            messagebox.showerror(
                "DRISHTI",
                "The pipeline failed:\n\n" + (getattr(self, "error_text", "") or
                                              "No result was produced.") +
                "\n\nYou can still run it from the command line.")
            self.btn_run.config(state=tk.NORMAL)
            return

        r = self.result
        cls = r.get("classification", {})
        trust = r.get("trust", {})
        ev = r.get("evidence", {})
        level = trust.get("trust_level", "?")
        color = TRUST_COLORS.get(level, "#333333")

        line1 = f"{cls.get('predicted_class', '?')}   |   confidence {cls.get('confidence', 0) * 100:.0f}%"
        line2 = (f"TRUST {trust.get('trust_score', 0):.3f}  ({level})  ->  "
                 f"{trust.get('route', '')}")
        line3 = ""
        if ev.get("dme_risk"):
            line3 = "\nDME ALERT: " + ev.get("dme_message", "exudate near fovea")
        self.verdict.config(text=line1 + "\n" + line2 + line3, fg=color)
        self.status.set(f"Done. Report saved -> results/{r.get('patient_id', '')}_report.png")
        self.show_report()
        self.btn_run.config(state=tk.NORMAL)

    def show_report(self):
        for widget in self.inner.winfo_children():
            widget.destroy()
        if not (self.report_path and os.path.exists(self.report_path)):
            tk.Label(self.inner, text="(report image not found)",
                     bg="#f5f5f5", fg="#888888").pack(pady=30)
            return
        img = Image.open(self.report_path)
        # scale the wide report to fit the window width
        target_w = 860
        ratio = target_w / img.width
        img = img.resize((target_w, int(img.height * ratio)), Image.LANCZOS)
        self.photo = ImageTk.PhotoImage(img)
        tk.Label(self.inner, image=self.photo, bg="#f5f5f5").pack(padx=8, pady=8)

    def open_folder(self):
        os.makedirs(RESULTS_DIR, exist_ok=True)
        try:
            os.startfile(RESULTS_DIR)          # Windows
        except AttributeError:
            subprocess.run(["xdg-open", RESULTS_DIR])   # Linux fallback

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    DrishtiConsole().run()
