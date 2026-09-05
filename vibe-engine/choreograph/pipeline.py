"""The Choreographer pipeline: analysis -> plan -> compile -> normalize."""
from __future__ import annotations

import logging
from typing import Any

from analyze import analyze, to_text
from . import llm
from .prompt import plan_prompt, compile_prompt, tokens_text, SCENES
from .validate import normalize, _default_modulators

log = logging.getLogger("choreographer")


def choreograph(path: str, raw: bytes | None = None, title: str = "Untitled") -> dict:
    a = analyze(path, raw)
    text = to_text(a)
    tokens = tokens_text()

    plan = llm.plan(plan_prompt(text, tokens))
    log.info("plan (first 200 chars): %s", plan[:200])

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            raw_json = llm.compile_json(compile_prompt(plan, text, int(a.duration * 1000)))
            doc = llm.parse_json(raw_json)
            meta = doc.setdefault("meta", {})
            meta.update(
                {
                    "fingerprint": a.fingerprint,
                    "bpm": a.bpm,
                    "durationMs": int(a.duration * 1000),
                    "title": title,
                }
            )
            return normalize(doc)
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("compile attempt %d failed: %s", attempt + 1, e)

    raise RuntimeError(f"choreography compilation failed: {last_err}")


def fallback_choreography(path: str, raw: bytes | None = None, title: str = "Untitled") -> dict:
    """Last-resort deterministic choreography (no LLM). Safety net so the endpoint never 500s."""
    a = analyze(path, raw)
    duration_ms = int(a.duration * 1000)

    beat = 60.0 / (a.bpm or 120.0)
    modulators = _default_modulators(duration_ms)
    for m in modulators:
        if m["id"] in ("pulseBase", "shakeMod"):
            m["period"] = beat

    hits = [
        {"time": int(o["time"] * 1000), "target": "pulseBase", "impulse": min(1.0, 0.3 + o["strength"]), "decay": 180}
        for o in a.onsets[:64]
    ]

    sections = []
    for s in a.sections:
        sections.append(
            {
                "id": s["id"],
                "start": int(s["start"] * 1000),
                "end": int(s["end"] * 1000),
                "energy": s["energy"],
                "scene": "grid",
                "palette": "calm",
            }
        )
    sections[0]["start"] = 0
    sections[-1]["end"] = duration_ms

    # Remap section energies so the quietest still drifts (never idle) and the peak hits full
    # intensity. Raw excitement curves are flat-ish; this stretches the dynamics for drama.
    emax = max(s["energy"] for s in sections) or 1.0
    for s in sections:
        s["energy"] = round(0.35 + 0.65 * (s["energy"] / emax), 3)

    # The single highest-energy section is the drop: stage + palette swap there.
    peak = max(sections, key=lambda s: s["energy"])
    peak["scene"] = "mosaic"
    peak["palette"] = "trip"
    drop = peak["start"]
    hits.append({"time": drop, "target": "shakeMod", "impulse": 1.0, "decay": 600})
    cuts = [{"time": drop, "from": "grid", "to": "mosaic", "style": "flip", "duration": 800, "easing": "cubic-bezier(0.22,1,0.36,1)", "lead": "c1"}]

    scenes = [{"id": "grid", **SCENES["grid"]}, {"id": "mosaic", **SCENES["mosaic"]}]

    palettes = [
        {"id": "calm", "tokens": {"--color-bg": "#2f86d5", "--color-surface": "#ead9c8", "--color-accent": "#ffe62b", "--color-text": "#fff7ef", "--color-muted": "#0a0b08", "--contrast-hint": "9"}},
        {"id": "trip", "tokens": {"--color-bg": "#080b08", "--color-surface": "#2f86d5", "--color-accent": "#ff5b9e", "--color-text": "#ffe62b", "--color-muted": "#fff7ef", "--contrast-hint": "9"}},
    ]
    transitions = [{"time": drop, "from": "calm", "to": "trip", "style": "blend", "duration": 2000}]

    return {
        "version": "1.0",
        "meta": {"fingerprint": a.fingerprint, "bpm": round(a.bpm, 2), "durationMs": duration_ms, "genre": "auto", "mood": "", "title": title},
        "modulators": modulators,
        "hits": hits,
        "sections": sections,
        "scenes": scenes,
        "cuts": cuts,
        "palettes": palettes,
        "paletteTransitions": transitions,
        "trails": {"decay": 0.85, "ghost": ["accent"]},
        "energy": a.energy,
    }
