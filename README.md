# VibeUI

A UI kit + compiler service that turns any song into a living choreography score, then drives a
site's layout, motion, and color to it — not like a video edit with cuts, but like a game engine
running an ambient music layer.

**The one interaction:** drop a song on a normal webpage and the *site itself* starts tripping —
hue drifts, text breathes, borders pulse on kicks, and on the drop the layout re-stages and the
palette flips. Built for the NERDCONF "Fun Build" track.

```
audio file
  -> structure/beat analysis (librosa)
  -> The Choreographer (DeepSeek plan -> compile)
  -> choreography JSON (cached by track fingerprint)
  -> client runs the simulation locally forever after
```

## Layout

```
vibe-ui/        the kit (runs the choreography + music)
  packages/core      zero-dep TS engine: rAF loop, modulator stack, hits, sections, cuts,
                     palettes, trails, device tiers, reduced-motion
  packages/react     VibeProvider + V.Camera/Post/World/Palette + V.Hero/Card/Button/Text
  apps/demo          Vite+React "boring page -> trip" (the judge-facing build)
vibe-engine/    the service (song -> choreography JSON)
  analyze/           Python/librosa: BPM, beat grid, onsets, energy, brightness, sections
  choreograph/       DeepSeek plan-then-compile -> schema-valid JSON
  app/               FastAPI: POST /choreograph, GET /choreography/{fingerprint}
```

## Try it (2 minutes)

### The kit + demo

```bash
cd vibe-ui
npm install
npm run synth        # regenerate the bundled synthetic track + its fixture (optional)
npm run dev          # http://localhost:5173
```

Pick a track (or press ▶) and watch the page jam. Drop any mp3/wav to choreograph it in-browser.
The `motion` toggle (full/reduced/minimal) is the reduced-motion guardrail.

### The engine

```bash
cd vibe-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # add DEEPSEEK_API_KEY
uvicorn app.main:app --reload --port 8000
```

```bash
curl -X POST -F "file=@song.mp3" http://localhost:8000/choreograph   # -> choreography JSON
curl http://localhost:8000/choreography/<fingerprint>               # cached hit
```

Without `DEEPSEEK_API_KEY` the endpoint uses a deterministic fallback so it never 500s; with the
key it runs the real two-pass Choreographer (`deepseek-reasoner` plans, `deepseek-chat` compiles).

### Wire the kit to the engine

```bash
cd vibe-ui
VITE_ENGINE_URL=http://localhost:8000 npm run dev
```

Now "upload" sends the file to the engine for a real LLM choreography instead of in-browser analysis.

## Deploy

- **`vibe-ui`** -> Vercel (static). `npm run build` outputs `apps/demo/dist`.
- **`vibe-engine`** -> Render / Fly (Python container): `pip install -r requirements.txt` +
  `uvicorn app.main:app`. Set `DEEPSEEK_API_KEY`, `CACHE_DIR`, and `ALLOWED_ORIGINS` to the UI origin.
- Point the UI at the engine with `VITE_ENGINE_URL=https://your-engine.onrender.com`.

## How the LLM "understands" beat peaks and excitement points

An LLM can't hear audio, so it's never handed raw samples. We hand it a **compact, discriminating
shape** derived from signal processing:

- **Beat peaks** = local maxima of the onset-strength envelope, reported as `(time, strength)` pairs,
  aligned to the beat grid (BPM).
- **Excitement** (not just loudness) = a weighted blend of RMS energy (loudness) + onset density
  (busyness) + spectral centroid (brightness). A quiet but dense, bright section is more exciting
  than a loud but sparse one.
- **Structural peaks** = where that excitement curve rises sharply (a build) and peaks-and-holds (a
  drop); these become candidate section boundaries.

`analyze/audio.py` reduces a whole song to ~2-3KB of text (`energy_curve_64`, `brightness_curve_32`,
`onset_density_32`, `beat_times_seconds`, `candidate_sections`, `top_onsets`) — see `to_text()`.
The Choreographer's plan prompt teaches the model to read that shape (rising slope = build, held
peak = drop, dense onsets = breakcore-like, sparse = ambient) and compose a *layered, non-unison*
modulator stack, additive hits, and rare scene/palette cuts. That taste difference — not the beat
grid — is the whole product.
