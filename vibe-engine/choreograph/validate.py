"""Light validation + normalization of LLM-compiled choreographies.

The LLM is asked for valid JSON, but we still normalize/coerce and drop invalid entries so a single
bad field doesn't break playback. This is the "compiled and safe by construction" guardrail.
"""
from __future__ import annotations

from typing import Any

WAVEFORMS = {"sine", "triangle", "perlin"}
COSTS = {"composite", "paint", "layout"}
CHANNELS = {"hue", "sat", "light", "contrast", "breath", "radius", "kerning", "pulse", "shake", "camX", "camY", "camZ", "driftX", "driftY"}
CUT_STYLES = {"hard", "flip", "blend"}
PALETTE_STYLES = {"hard", "blend"}


def _num(v: Any, lo: float, hi: float, default: float) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, f))


def _clamp(v: Any, lo: float, hi: float, default: float) -> float:
    return _num(v, lo, hi, default)


def normalize(doc: dict) -> dict:
    duration = int(doc.get("meta", {}).get("durationMs", 0) or 0)
    if duration <= 0:
        raise ValueError("meta.durationMs missing")

    # --- modulators ---
    modulators = []
    seen = set()
    for m in doc.get("modulators", []):
        mid = str(m.get("id", "")).strip()
        target = str(m.get("target", "")).strip()
        if not mid or mid in seen or target not in CHANNELS:
            continue
        seen.add(mid)
        modulators.append(
            {
                "id": mid,
                "waveform": m.get("waveform") if m.get("waveform") in WAVEFORMS else "sine",
                "period": _num(m.get("period"), 0.3, 120.0, 8.0),
                "phase": _clamp(m.get("phase"), 0.0, 0.999, 0.0),
                "target": target,
                "amplitudeSource": m.get("amplitudeSource") if m.get("amplitudeSource") in ("energy", "fixed") else "energy",
                "amplitude": _clamp(m.get("amplitude"), 0.0, 1.0, 0.3),
                "cost": m.get("cost") if m.get("cost") in COSTS else "composite",
            }
        )
    if not modulators:
        modulators = _default_modulators(duration)

    modulator_ids = {m["id"] for m in modulators}

    # --- hits ---
    hits = []
    for h in doc.get("hits", []):
        tgt = str(h.get("target", "")).strip()
        if tgt not in modulator_ids:
            continue
        hits.append(
            {
                "time": int(_num(h.get("time"), 0.0, duration, 0.0)),
                "target": tgt,
                "impulse": _clamp(h.get("impulse"), 0.0, 1.5, 0.5),
                "decay": _num(h.get("decay"), 50.0, 2000.0, 200.0),
            }
        )
    hits.sort(key=lambda x: x["time"])

    # --- palettes (must use brand vocabulary; we accept whatever hex but enforce contrast hint) ---
    palettes = []
    for p in doc.get("palettes", []):
        pid = str(p.get("id", "")).strip()
        tokens = p.get("tokens", {}) or {}
        if not pid:
            continue
        tok = {}
        for k in ("--color-bg", "--color-surface", "--color-accent", "--color-text", "--color-muted"):
            v = tokens.get(k)
            if isinstance(v, str) and v.startswith("#"):
                tok[k] = v
        if "--color-bg" not in tok or "--color-text" not in tok:
            continue
        contrast = _num(tokens.get("--contrast-hint"), 4.5, 21.0, 9.0)
        tok["--contrast-hint"] = str(round(contrast, 1))
        palettes.append({"id": pid, "tokens": tok})
    if not palettes:
        palettes = [
            {"id": "calm", "tokens": {"--color-bg": "#2f86d5", "--color-surface": "#ead9c8", "--color-accent": "#ffe62b", "--color-text": "#fff7ef", "--color-muted": "#0a0b08", "--contrast-hint": "9"}},
            {"id": "trip", "tokens": {"--color-bg": "#080b08", "--color-surface": "#2f86d5", "--color-accent": "#ff5b9e", "--color-text": "#ffe62b", "--color-muted": "#fff7ef", "--contrast-hint": "9"}},
        ]
    palette_ids = {p["id"] for p in palettes}

    # --- scenes (copy the known scene defs verbatim) ---
    from .prompt import SCENES
    scenes = []
    for s in doc.get("scenes", []):
        sid = str(s.get("id", "")).strip()
        if sid in SCENES:
            scenes.append({"id": sid, **SCENES[sid]})
    if not scenes:
        scenes = [{"id": "hero-solo", **SCENES["hero-solo"]}, {"id": "mosaic", **SCENES["mosaic"]}]
    scene_ids = {s["id"] for s in scenes}

    # --- sections (must tile 0..duration) ---
    sections = []
    for s in doc.get("sections", []):
        start = int(_num(s.get("start"), 0.0, duration, 0.0))
        end = int(_num(s.get("end"), 0.0, duration, duration))
        if end <= start:
            continue
        sections.append(
            {
                "id": str(s.get("id", "")).strip() or f"s{len(sections)}",
                "start": start,
                "end": end,
                "energy": _clamp(s.get("energy"), 0.05, 1.0, 0.3),
                "scene": s.get("scene") if s.get("scene") in scene_ids else (scenes[0]["id"]),
                "palette": s.get("palette") if s.get("palette") in palette_ids else (palettes[0]["id"]),
            }
        )
    sections.sort(key=lambda x: x["start"])
    if not sections:
        sections = [{"id": "all", "start": 0, "end": duration, "energy": 0.5, "scene": scenes[0]["id"], "palette": palettes[0]["id"]}]
    else:
        sections[0]["start"] = 0
        sections[-1]["end"] = duration
        # fill any gaps
        for i in range(1, len(sections)):
            if sections[i]["start"] < sections[i - 1]["end"]:
                sections[i]["start"] = sections[i - 1]["end"]
        if sections[0]["end"] > duration:
            sections[0]["end"] = duration

    # --- cuts ---
    cuts = []
    for c in doc.get("cuts", []):
        if c.get("from") not in scene_ids or c.get("to") not in scene_ids:
            continue
        cuts.append(
            {
                "time": int(_num(c.get("time"), 0.0, duration, 0.0)),
                "from": c["from"],
                "to": c["to"],
                "style": c.get("style") if c.get("style") in CUT_STYLES else "flip",
                "duration": _num(c.get("duration"), 100.0, 3000.0, 800.0),
                "easing": c.get("easing") or "cubic-bezier(0.22,1,0.36,1)",
                "lead": c.get("lead") or "hero",
            }
        )
    cuts.sort(key=lambda x: x["time"])

    # --- palette transitions ---
    transitions = []
    for t in doc.get("paletteTransitions", []):
        if t.get("from") not in palette_ids or t.get("to") not in palette_ids:
            continue
        transitions.append(
            {
                "time": int(_num(t.get("time"), 0.0, duration, 0.0)),
                "from": t["from"],
                "to": t["to"],
                "style": t.get("style") if t.get("style") in PALETTE_STYLES else "blend",
                "duration": _num(t.get("duration"), 100.0, 5000.0, 2000.0),
            }
        )
    transitions.sort(key=lambda x: x["time"])

    trails = doc.get("trails", {}) or {}
    trails = {"decay": _clamp(trails.get("decay"), 0.0, 0.99, 0.85), "ghost": list(trails.get("ghost", []) or ["accent"])}

    energy = [_clamp(v, 0.0, 1.0, 0.3) for v in (doc.get("energy", []) or [])]
    if len(energy) != 64:
        energy = [0.3] * 64

    meta = {
        "fingerprint": str(doc.get("meta", {}).get("fingerprint", "")),
        "bpm": _num(doc.get("meta", {}).get("bpm"), 40.0, 220.0, 120.0),
        "durationMs": duration,
        "genre": str(doc.get("meta", {}).get("genre", "auto")),
        "mood": str(doc.get("meta", {}).get("mood", "")),
        "title": str(doc.get("meta", {}).get("title", "Untitled")),
    }

    return {
        "version": "1.0",
        "meta": meta,
        "modulators": modulators,
        "hits": hits,
        "sections": sections,
        "scenes": scenes,
        "cuts": cuts,
        "palettes": palettes,
        "paletteTransitions": transitions,
        "trails": trails,
        "energy": energy,
    }


def _default_modulators(duration: int) -> list[dict]:
    beat = 60 / 120
    return [
        {"id": "hueDrift", "waveform": "perlin", "period": 8, "phase": 0.0, "target": "hue", "amplitudeSource": "energy", "amplitude": 1.0, "cost": "paint"},
        {"id": "hueFast", "waveform": "sine", "period": 3, "phase": 0.4, "target": "hue", "amplitudeSource": "energy", "amplitude": 0.5, "cost": "paint"},
        {"id": "satDrift", "waveform": "sine", "period": 4, "phase": 0.25, "target": "sat", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "paint"},
        {"id": "lightDrift", "waveform": "perlin", "period": 10, "phase": 0.3, "target": "light", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "paint"},
        {"id": "contrastDrift", "waveform": "sine", "period": 5, "phase": 0.55, "target": "contrast", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "paint"},
        {"id": "breath", "waveform": "sine", "period": 3, "phase": 0.05, "target": "breath", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "composite"},
        {"id": "radiusFlow", "waveform": "triangle", "period": 5, "phase": 0.15, "target": "radius", "amplitudeSource": "energy", "amplitude": 0.9, "cost": "paint"},
        {"id": "kerning", "waveform": "perlin", "period": 8, "phase": 0.5, "target": "kerning", "amplitudeSource": "fixed", "amplitude": 0.6, "cost": "layout"},
        {"id": "camX", "waveform": "sine", "period": 5, "phase": 0.0, "target": "camX", "amplitudeSource": "energy", "amplitude": 0.7, "cost": "composite"},
        {"id": "camY", "waveform": "sine", "period": 6, "phase": 0.33, "target": "camY", "amplitudeSource": "energy", "amplitude": 0.55, "cost": "composite"},
        {"id": "camZ", "waveform": "perlin", "period": 9, "phase": 0.6, "target": "camZ", "amplitudeSource": "energy", "amplitude": 0.8, "cost": "composite"},
        {"id": "pulseBase", "waveform": "sine", "period": beat, "phase": 0.0, "target": "pulse", "amplitudeSource": "energy", "amplitude": 0.25, "cost": "composite"},
        {"id": "shakeMod", "waveform": "sine", "period": beat, "phase": 0.7, "target": "shake", "amplitudeSource": "fixed", "amplitude": 0.1, "cost": "composite"},
    ]
