"""Offline audio analysis -> a compact, LLM-readable structural summary.

The core insight for making an LLM "understand" beat peaks and excitement points:

An LLM can't hear audio. So we don't hand it raw audio or per-frame samples — we hand it a
*discriminating, token-efficient shape* of the music, derived from signal-processing features:

- **Beat peaks**   -> the onset-strength envelope + the beat grid. A "beat peak" is a local max
                     of onset strength that lands on the beat grid (BPM). We report the strongest
                     few hundred as (time, strength) pairs, not the raw envelope.
- **Excitement**   -> not just loudness. A weighted blend of RMS energy (loudness), onset density
                     (busyness), and spectral centroid (brightness) is a much better "excitement"
                     proxy than RMS alone — a quiet but dense, bright section is more exciting than
                     a loud but sparse one.
- **Structural peaks** -> the *novelty* of the excitement curve: where the curve rises sharply is
                     a build; where it peaks and holds is a drop. We report candidate section
                     boundaries from those novelty peaks.

The result is a small text block (~2-3KB) the model reads as a "shape" and reasons about — the
same job a game audio director does reading a session layout.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import librosa


@dataclass
class Analysis:
    fingerprint: str
    sr: int
    duration: float
    bpm: float
    beat_times: list[float] = field(default_factory=list)
    onsets: list[dict] = field(default_factory=list)  # {time, strength}
    energy: list[float] = field(default_factory=list)  # 64 samples in [0,1]
    brightness: list[float] = field(default_factory=list)  # 32 samples in [0,1]
    onset_density: list[float] = field(default_factory=list)  # 32 samples in [0,1]
    sections: list[dict] = field(default_factory=list)  # {start,end,energy}


def fingerprint(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _normalize(x: np.ndarray, n: int) -> list[float]:
    """Downsample a 1-D signal to n points, normalize to [0,1]."""
    if x.size == 0:
        return [0.0] * n
    idx = np.linspace(0, x.size - 1, n).astype(int)
    vals = x[idx]
    lo = float(vals.min())
    hi = float(vals.max())
    if hi - lo < 1e-9:
        return [0.0] * n
    return [round(float((v - lo) / (hi - lo)), 3) for v in vals]


def analyze(path: str, raw: bytes | None = None) -> Analysis:
    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = float(len(y) / sr)

    # --- Tempo + beat grid (the shared clock) ---
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    bpm = float(np.asarray(tempo).ravel()[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    # --- Onset strength envelope -> beat peaks ---
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)

    # Adaptive peak-picking (delta-threshold, robust to a single dominating transient).
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=512)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
    peaks = [(float(t), float(onset_env[f])) for f, t in zip(onset_frames, onset_times)]

    # Keep the strongest few hundred (ranked), then restore time order.
    peaks.sort(key=lambda p: -p[1])
    peaks = peaks[:400]
    peaks.sort(key=lambda p: p[0])
    max_strength = max((s for _, s in peaks), default=1.0)
    onsets = [{"time": round(t, 3), "strength": round(s / max_strength, 3)} for t, s in peaks]

    # --- Energy (RMS) ---
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    energy = _normalize(rms, 64)

    # --- Brightness (spectral centroid) ---
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=512)[0]
    brightness = _normalize(centroid, 32)

    # --- Onset density (busyness): onsets per sliding window ---
    hop_t = 512 / sr
    frame_count = int(duration / hop_t)
    density = np.zeros(max(frame_count, 1))
    for t, _ in peaks:
        i = int(t / hop_t)
        if 0 <= i < density.size:
            density[i] += 1
    win = max(1, int(2.0 / hop_t))  # ~2s window
    density = np.convolve(density, np.ones(win) / win, mode="same")
    onset_density = _normalize(density, 32)

    # --- Candidate sections from the excitement curve ---
    excitement = np.array(energy)  # energy is 64 pts; density/brightness are 32 -> resample
    dens = np.interp(np.linspace(0, 1, 64), np.linspace(0, 1, 32), onset_density)
    bright = np.interp(np.linspace(0, 1, 64), np.linspace(0, 1, 32), brightness)
    excitement = 0.5 * excitement + 0.3 * dens + 0.2 * bright
    # Smooth to avoid spiky fragmentation from sparse/percussive tracks.
    w = np.ones(5) / 5
    excitement = np.convolve(excitement, w, mode="same")
    sections = _segment(excitement, duration)

    fp = fingerprint(raw) if raw else fingerprint(open(path, "rb").read())

    return Analysis(
        fingerprint=fp,
        sr=int(sr),
        duration=round(duration, 3),
        bpm=round(bpm, 2),
        beat_times=[round(t, 3) for t in beat_times],
        onsets=onsets,
        energy=energy,
        brightness=brightness,
        onset_density=onset_density,
        sections=sections,
    )


def _segment(excitement: np.ndarray, duration: float) -> list[dict]:
    """Cluster the excitement curve into low/mid/high-energy candidate sections."""
    n = len(excitement)
    labels: list[int] = []
    for v in excitement:
        if v < 0.35:
            labels.append(0)
        elif v < 0.7:
            labels.append(1)
        else:
            labels.append(2)

    # Run-length encode, then merge short runs (<2s) into their predecessor to avoid fragmentation.
    runs: list[dict] = []
    i = 0
    while i < n:
        j = i
        while j < n and labels[j] == labels[i]:
            j += 1
        runs.append({"start_i": i, "end_i": j, "start": i / n * duration, "end": j / n * duration})
        i = j

    min_dur = 2.0
    merged: list[dict] = []
    for r in runs:
        if merged and (r["end"] - r["start"]) < min_dur:
            merged[-1]["end_i"] = r["end_i"]
            merged[-1]["end"] = r["end"]
        else:
            merged.append(r)

    sections: list[dict] = []
    for k, r in enumerate(merged):
        seg = excitement[r["start_i"] : r["end_i"]]
        energy = float(seg.mean()) if seg.size else 0.0
        sections.append(
            {
                "id": f"s{k}",
                "start": round(r["start"], 3),
                "end": round(r["end"], 3),
                "energy": round(max(0.05, min(1.0, energy)), 3),
            }
        )
    if sections:
        sections[0]["start"] = 0.0
        sections[-1]["end"] = round(duration, 3)
    return sections


def to_text(a: Analysis) -> str:
    """Serialize the analysis into a compact block the LLM reads as a shape."""
    lines: list[str] = []
    lines.append(f"bpm: {a.bpm}")
    lines.append(f"duration_seconds: {a.duration}")
    lines.append(f"sample_rate: {a.sr}")
    lines.append("")
    lines.append("energy_curve_64: " + " ".join(f"{v:.2f}" for v in a.energy))
    lines.append("brightness_curve_32: " + " ".join(f"{v:.2f}" for v in a.brightness))
    lines.append("onset_density_32: " + " ".join(f"{v:.2f}" for v in a.onset_density))
    lines.append("")
    lines.append("beat_times_seconds: " + " ".join(f"{t:.2f}" for t in a.beat_times[:128]))
    lines.append("")
    lines.append("candidate_sections (start_s end_s energy_0_1):")
    for s in a.sections:
        lines.append(f"  {s['start']:.2f} {s['end']:.2f} {s['energy']:.2f}")
    lines.append("")
    lines.append("top_onsets (time_s strength_0_1):")
    for o in a.onsets[:256]:
        lines.append(f"  {o['time']:.2f} {o['strength']:.2f}")
    return "\n".join(lines)
