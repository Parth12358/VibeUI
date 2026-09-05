"""Prompts for the two-pass Choreographer: plan (reasoning) -> compile (schema-valid JSON).

Pass 1 (deepseek-reasoner) reads the analysis shape and reasons about mood/genre/structure in
plain language. Pass 2 (deepseek-chat) compiles that plan into schema-valid JSON. Splitting keeps
a debuggable intermediate artifact: if the choreography feels wrong you know whether the *taste*
was wrong (fix pass 1) or the *compilation* was wrong (fix pass 2).
"""
from __future__ import annotations

# The site's brand vocabulary (Burning Token palette). The choreographer seeds palettes from THIS
# scale — never invents colors outside the brand. In production this manifest is uploaded with the site.
SITE_TOKENS = {
    "colors": ["#2f86d5", "#080b08", "#0a0b08", "#ffe62b", "#ff5b9e", "#18ff38", "#fff7ef", "#ead9c8"],
    "radiusScale": [0, 4, 8, 12, 16],
    "spaceScale": [4, 8, 12, 16, 24, 32, 48, 64],
    "typeScale": [12, 14, 16, 20, 28, 40, 56, 96],
    "tokenNames": ["--color-bg", "--color-surface", "--color-accent", "--color-text", "--color-muted", "--contrast-hint"],
}

# Named scenes the compiler may stage into. It picks scene ids, not grids. The page owns four
# challenge cards (c1..c4): a calm 4-up row that re-stages into a mosaic on the drop.
SCENES = {
    "grid": {
        "areas": '"c1 c2 c3 c4"',
        "columns": "repeat(4, 1fr)",
        "rows": "auto",
        "assignment": {"c1": "c1", "c2": "c2", "c3": "c3", "c4": "c4"},
    },
    "mosaic": {
        "areas": '"c1 c1 c2 c3" "c1 c1 c4 c4"',
        "columns": "repeat(4, 1fr)",
        "rows": "1fr 1fr",
        "assignment": {"c1": "c1", "c2": "c2", "c3": "c3", "c4": "c4"},
    },
}

CHANNELS = ["hue", "sat", "light", "contrast", "breath", "radius", "kerning", "pulse", "shake", "camX", "camY", "camZ", "driftX", "driftY"]

SYSTEM = """You are The Choreographer — an audio director for websites. You turn a song's analysis into a
"choreography" that drives a webpage's continuous motion, color, and (rare) layout changes.

THE FEELING: a jam, not a music-video edit. Continuous, layered, never fully at rest. Not discrete
cuts. Concretely:
- Never idle: even the quietest section has something drifting. Energy controls *amplitude and
  rate* of motion, never whether motion is on. Amplitude floors stay > 0.
- Polyrhythm, not one clock: different modulators groove at different, only-loosely-related rates.
  Deliberately NOT phase-locked. Near-alignment and phase drift read as organic.
- Hits are additive, not resetting: an impulse perturbs an already-running oscillator (spring-kick),
  never resets it to rest.
- Color/distortion is the primary drug; hard layout cuts are the rare accent. Most of the "trip"
  lives in continuous hue/saturation/brightness drift and breathing shapes.

HOW TO READ THE ANALYSIS (this is critical):
- energy_curve_64 is the loudness shape in [0,1]. Rising slopes = builds; peaks that hold = drops;
  valleys = breakdowns. Map your amplitude scaling to this curve — but never to zero.
- brightness_curve_32 (spectral centroid) and onset_density_32 tell you *excitement*, which is not
  the same as loudness: a dense, bright quiet section is more exciting than a sparse loud one.
- top_onsets are the beat peaks (time, strength). Place hits here, sized to strength. Dense/strong
  onsets -> frequent sharp impulses (breakcore-like); sparse/soft -> rare gentle ones (ambient).
- candidate_sections are rough structure; you may override boundaries when the energy shape
  suggests better ones (e.g. a clear drop should start a new section at its build-up).

GENRE/TEMPO TASTE: same BPM choreographs differently by mood. Slow melancholy -> slow,
barely-perceptible drift, wide periods, low amplitude. Aggressive/fast -> fast jittery polyrhythm,
high amplitude, more/faster hits. This taste difference is your actual job — do not just echo the
beat grid.

CONSTRAINTS:
- Only use the provided channels, scene ids, and brand color vocabulary.
- text (kerning) must stay readable: keep its amplitude low and clamp is handled downstream.
- Palette swaps must keep contrast readable (--contrast-hint >= 4.5).
- Keep total modulators ~6-10, with phases deliberately spread (not all 0.0).
- No scene cut fires more than once per ~8 seconds. Layout cuts are RARE punctuation."""


def plan_prompt(analysis_text: str, tokens_text: str) -> list[dict]:
    user = f"""Here is a song's structural analysis:\n\n{analysis_text}\n\nDesign-token vocabulary:\n{tokens_text}\n\nAvailable scenes: {list(SCENES.keys())}\nAvailable channels: {", ".join(CHANNELS)}\n\nRead the shape, decide mood/genre/tempo character, and propose a staging plan in plain language. Cover: (1) the modulator mix — how many oscillators on which channels, with what period/phase relationships (deliberately non-unison); (2) amplitude-vs-section mapping (never zero); (3) where hits land and which modulator each perturbs, sized to genre; (4) the rare scene cuts and palette changes, placed on real structural moments (build->drop). Do NOT output JSON. Be specific with numbers (periods in seconds, times in seconds, amplitudes 0-1)."""
    return [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ]


def compile_prompt(plan_text: str, analysis_text: str, duration_ms: int) -> list[dict]:
    user = f"""Turn this staging plan into a single JSON object matching the schema below exactly.

PLAN:
{plan_text}

ANALYSIS (for reference):
{analysis_text}

TRACK DURATION: {duration_ms} ms.

SCHEMA (all fields required; version must be "1.0"):
{{
  "version": "1.0",
  "meta": {{ "fingerprint": string, "bpm": number, "durationMs": number, "genre": string, "mood": string, "title": string }},
  "modulators": [ {{ "id": string, "waveform": "sine"|"triangle"|"perlin", "period": number(seconds), "phase": number(0-1), "target": channel, "amplitudeSource": "energy"|"fixed", "amplitude": number(0-1), "cost": "composite"|"paint"|"layout" }} ],
  "hits": [ {{ "time": number(ms), "target": modulatorId, "impulse": number(0-1), "decay": number(ms) }} ],
  "sections": [ {{ "id": string, "start": number(ms), "end": number(ms), "energy": number(0-1), "scene": sceneId, "palette": paletteId }} ],
  "scenes": [ SCENE_OBJECT ],
  "cuts": [ {{ "time": number(ms), "from": sceneId, "to": sceneId, "style": "hard"|"flip"|"blend", "duration": number(ms), "easing": string, "lead": string }} ],
  "palettes": [ {{ "id": string, "tokens": {{ "--color-bg": hex, "--color-surface": hex, "--color-accent": hex, "--color-text": hex, "--color-muted": hex, "--contrast-hint": "4.5" or higher }} }} ],
  "paletteTransitions": [ {{ "time": number(ms), "from": paletteId, "to": paletteId, "style": "hard"|"blend", "duration": number(ms) }} ],
  "trails": {{ "decay": number(0-1), "ghost": [tokenName] }},
  "energy": [ 64 numbers 0-1 ]
}}

SCENE_OBJECT = exactly one of these two, verbatim:
{SCENES}

RULES:
- Use the exact scene objects above for the "scenes" array (pick hero-solo and/or mosaic, copy their areas/columns/rows/assignment verbatim).
- Every section must carry a "scene" and a "palette". Sections must tile 0..durationMs with no gaps.
- Palettes must use ONLY hex colors from this vocabulary: {SITE_TOKENS["colors"]}. A "calm" palette is dark/low-saturation; a "trip" palette is saturated/high-contrast. Set --contrast-hint to a number >= 4.5 (use "12" for calm, "9" for trip).
- Phases must be spread (avoid many modulators with phase 0.0).
- Output valid JSON only, no commentary."""

    import json
    scenes_json = json.dumps(SCENES)
    user = user.replace("{SCENES}", scenes_json)

    return [
        {"role": "system", "content": SYSTEM + "\n\nYou respond ONLY with a single valid JSON object."},
        {"role": "user", "content": user},
    ]


def tokens_text() -> str:
    import json
    return json.dumps(SITE_TOKENS, indent=2)
