#!/usr/bin/env python3
"""Generate a synthetic demo track (WAV) plus a perfectly-synced choreography fixture (JSON).

This doubles as a stand-in for the vibe-engine pipeline: it knows the beat grid and section
structure, so it emits the same schema the librosa+LLM choreographer will produce for real songs.
"""
import json
import math
import struct
import wave
from pathlib import Path

SR = 44100
DURATION = 32.0  # seconds
BPM = 120.0
BEAT = 60.0 / BPM  # 0.5s

# Sections: (id, start_s, end_s, energy, scene, palette)
SECTIONS = [
    ("verse", 0.0, 8.0, 0.25, "grid", "calm"),
    ("build", 8.0, 14.0, 0.55, "grid", "calm"),
    ("drop", 14.0, 24.0, 1.0, "mosaic", "trip"),
    ("outro", 24.0, 32.0, 0.4, "grid", "calm"),
]

KICK_DENSITY = {
    "verse": 4,  # every N beats
    "build": 2,
    "drop": 1,
    "outro": 4,
}


def kick_times():
    times = []
    t = 0.0
    i = 0
    while t < DURATION:
        for sid, s, e, _en, _sc, _pal in SECTIONS:
            if s <= t < e:
                density = KICK_DENSITY[sid]
                if i % density == 0:
                    times.append((t, sid))
        i += 1
        t += BEAT
    return times


def synth():
    n = int(SR * DURATION)
    out = [0.0] * n

    def section_at(t):
        for sid, s, e, en, sc, pal in SECTIONS:
            if s <= t < e:
                return sid, en
        return "outro", 0.4

    def add_bass():
        # Low drone whose amplitude follows the energy curve.
        for i in range(n):
            t = i / SR
            sid, en = section_at(t)
            freq = 55.0 + 20.0 * math.sin(2 * math.pi * t / 8.0)
            env = en * (0.5 + 0.5 * math.sin(2 * math.pi * t / 4.0))
            out[i] += 0.12 * env * math.sin(2 * math.pi * freq * t)

    def add_pad():
        for i in range(n):
            t = i / SR
            sid, en = section_at(t)
            env = en
            v = math.sin(2 * math.pi * 220.0 * t) + 0.6 * math.sin(2 * math.pi * 330.0 * t)
            out[i] += 0.03 * env * v

    def add_kicks():
        for t, sid in kick_times():
            i0 = int(t * SR)
            amp = 0.7 if sid == "drop" else (0.5 if sid == "build" else 0.35)
            for j in range(int(0.25 * SR)):
                idx = i0 + j
                if idx >= n:
                    break
                tt = j / SR
                out[idx] += amp * math.exp(-tt * 30.0) * math.sin(2 * math.pi * (90.0 - tt * 200.0) * tt)

    add_bass()
    add_pad()
    add_kicks()

    # Normalize.
    peak = max(abs(x) for x in out) or 1.0
    gain = 0.85 / peak
    pcm = bytearray()
    for x in out:
        v = int(max(-1.0, min(1.0, x * gain)) * 32767)
        pcm += struct.pack("<h", v)

    out_wav = Path(__file__).resolve().parents[1] / "public" / "tracks" / "synth_demo.wav"
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(pcm))
    print(f"wrote {out_wav}")

    return kick_times()


def ms(t):
    return int(round(t * 1000))


def build_choreography(kicks):
    modulators = [
        {"id": "hueDrift", "waveform": "perlin", "period": 8, "phase": 0.0, "target": "hue", "amplitudeSource": "energy", "amplitude": 1.0, "cost": "paint"},
        {"id": "hueFast", "waveform": "sine", "period": 3, "phase": 0.4, "target": "hue", "amplitudeSource": "energy", "amplitude": 0.5, "cost": "paint"},
        {"id": "satDrift", "waveform": "sine", "period": 4, "phase": 0.25, "target": "sat", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "paint"},
        {"id": "lightDrift", "waveform": "perlin", "period": 10, "phase": 0.3, "target": "light", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "paint"},
        {"id": "contrastDrift", "waveform": "sine", "period": 5, "phase": 0.55, "target": "contrast", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "paint"},
        {"id": "breath", "waveform": "sine", "period": 3, "phase": 0.0, "target": "breath", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "composite"},
        {"id": "radiusFlow", "waveform": "triangle", "period": 5, "phase": 0.1, "target": "radius", "amplitudeSource": "energy", "amplitude": 0.9, "cost": "paint"},
        {"id": "kerning", "waveform": "perlin", "period": 8, "phase": 0.5, "target": "kerning", "amplitudeSource": "fixed", "amplitude": 0.6, "cost": "layout"},
        {"id": "camX", "waveform": "sine", "period": 5, "phase": 0.0, "target": "camX", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "composite"},
        {"id": "camY", "waveform": "sine", "period": 6, "phase": 0.33, "target": "camY", "amplitudeSource": "energy", "amplitude": 0.55, "cost": "composite"},
        {"id": "camZ", "waveform": "perlin", "period": 9, "phase": 0.0, "target": "camZ", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "composite"},
        {"id": "pulseBase", "waveform": "sine", "period": 0.5, "phase": 0.0, "target": "pulse", "amplitudeSource": "energy", "amplitude": 0.25, "cost": "composite"},
        {"id": "shakeMod", "waveform": "sine", "period": 0.5, "phase": 0.0, "target": "shake", "amplitudeSource": "fixed", "amplitude": 0.1, "cost": "composite"},
    ]

    hits = []
    for t, sid in kicks:
        impulse = 0.9 if sid == "drop" else (0.6 if sid == "build" else 0.4)
        hits.append({"time": ms(t), "target": "pulseBase", "impulse": impulse, "decay": 180})
    # Big structural hits on section boundaries -> camera shake.
    for sid, s, e, en, sc, pal in SECTIONS:
        if sid in ("build", "drop"):
            hits.append({"time": ms(s), "target": "shakeMod", "impulse": 1.0 if sid == "drop" else 0.6, "decay": 600})

    sections = [
        {"id": sid, "start": ms(s), "end": ms(e), "energy": en, "scene": sc, "palette": pal}
        for sid, s, e, en, sc, pal in SECTIONS
    ]

    scenes = [
        {
            "id": "grid",
            "areas": '"c1 c2 c3 c4"',
            "columns": "repeat(4, 1fr)",
            "rows": "auto",
            "assignment": {"c1": "c1", "c2": "c2", "c3": "c3", "c4": "c4"},
        },
        {
            "id": "mosaic",
            "areas": '"c1 c1 c2 c3" "c1 c1 c4 c4"',
            "columns": "repeat(4, 1fr)",
            "rows": "1fr 1fr",
            "assignment": {"c1": "c1", "c2": "c2", "c3": "c3", "c4": "c4"},
        },
    ]

    cuts = [
        {"time": ms(14.0), "from": "grid", "to": "mosaic", "style": "flip", "duration": 800, "easing": "cubic-bezier(0.22,1,0.36,1)", "lead": "c1"},
        {"time": ms(24.0), "from": "mosaic", "to": "grid", "style": "flip", "duration": 800, "easing": "cubic-bezier(0.22,1,0.36,1)", "lead": "c1"},
    ]

    palettes = [
        {"id": "calm", "tokens": {"--color-bg": "#2f86d5", "--color-surface": "#ead9c8", "--color-accent": "#ffe62b", "--color-text": "#fff7ef", "--color-muted": "#0a0b08", "--contrast-hint": "9"}},
        {"id": "trip", "tokens": {"--color-bg": "#080b08", "--color-surface": "#2f86d5", "--color-accent": "#ff5b9e", "--color-text": "#ffe62b", "--color-muted": "#fff7ef", "--contrast-hint": "9"}},
    ]

    palette_transitions = [
        {"time": ms(14.0), "from": "calm", "to": "trip", "style": "blend", "duration": 2000},
        {"time": ms(24.0), "from": "trip", "to": "calm", "style": "blend", "duration": 2000},
    ]

    energy = []
    for i in range(64):
        t = i / 63 * DURATION
        en = 0.25
        for sid, s, e, val, sc, pal in SECTIONS:
            if s <= t < e:
                en = val
        energy.append(round(en, 3))

    doc = {
        "version": "1.0",
        "meta": {"fingerprint": "synth-demo-v1", "bpm": BPM, "durationMs": ms(DURATION), "genre": "synth", "mood": "builds to a drop", "title": "Synthetic Demo"},
        "modulators": modulators,
        "hits": hits,
        "sections": sections,
        "scenes": scenes,
        "cuts": cuts,
        "palettes": palettes,
        "paletteTransitions": palette_transitions,
        "trails": {"decay": 0.85, "ghost": ["accent"]},
        "energy": energy,
    }

    out_json = Path(__file__).resolve().parents[1] / "src" / "fixtures" / "synth_demo.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(doc, f, indent=2)
    print(f"wrote {out_json}")


if __name__ == "__main__":
    kicks = synth()
    build_choreography(kicks)
    print(f"kick count: {len(kicks)}")
