# Fun Build — NERDCONF Submission Evidence

**Project:** Vibe Trip — a Chrome extension that turns any website into a music-reactive rave.

## How we meet the challenge

**The idea (weird / funny / unexpected):** Audio visualizers are 25 years old and they all live in a `<canvas>`. Vibe Trip inverts that — it treats the *website itself* as the canvas. You press one button and whatever page you're on (Twitter, docs, a boring SaaS site) loses its mind to the beat: colors churn, buttons and divs bounce on the kick, text cycles through the rainbow, and a live visualizer, confetti bursts, shockwaves, and a sweeping rainbow wash run over the page. The surprise — "this boring page just started doing acid" — is the whole product, in the same spirit as SlapMac (one input → a playful, unexpected reaction).

**The one great interaction:** press **"Start trip"** → any site becomes a rave, synced to a song.

## Test steps (a judge can try this in ~30 seconds)

**Path A — the extension (the actual product):**
1. Download `vibe-trip-extension.zip` (linked on the demo page, or the `extension/` folder in the repo).
2. Open `chrome://extensions` → toggle **Developer mode** → **Load unpacked** → select the unzipped folder.
3. Click the **Vibe Trip** icon → pick a song (Clarity / Rave / Synth Demo) → **Start trip**.
4. Watch the current page rave. Navigate anywhere — it follows you to every site.
5. **Stop trip** to return the page to normal.

**Path B — hosted demo (zero install):**
1. Open the demo URL (the page is itself tripping to a bundled track).
2. Hit **▶ Play** (or pick a song). The page immediately hue-cycles, buttons/cards bounce on the beat, and text cycles color.
3. On the drop, the four challenge cards re-stage into a mosaic and the palette flips blue→ink.

## Demo timestamps (30s video, mapped to Clarity)

| Time | What the judge sees |
|---|---|
| 0:00–0:05 | A normal website. |
| 0:06 | Click **Start trip**. |
| 0:07–0:20 | The page trips: hue churn, bouncing elements, rainbow bars, waveform, confetti on kicks. |
| 0:21–0:28 | Navigate to a *second* site — it's tripping too. |
| 0:28–0:30 | Punchline: "Dark Reader, but it makes your site do acid." |

Key in-product "money shot" moments: the **synth demo drops at 0:14**, the **Rave track is 175 BPM** (fastest payoff), and **Clarity's drop is at ~2:24** — all scripted in `songs.js` and beat-synced from live audio analysis.

## How this maps to the judging criteria

- **Shipping** — works as a load-unpacked extension (bundled songs, no server, no API key) *and* as a hosted demo URL. Anyone can try it with zero setup.
- **Originality** — a fresh take on two familiar things: "audio visualizer" × "transform-any-site extension (Dark Reader)". Nobody's combined them.
- **Fun** — the before/after surprise is inherently worth showing a friend; the beat-synced details (BPM-locked bobbing, kick-synced confetti/strobe) make it feel alive, not random.
- **Execution** — one-click, reliable (no screen-capture fragility — songs are bundled and analyzed with the Web Audio API), with intensity + reduced-motion controls and a clean on/off.

## Hardware / requirements

None beyond a desktop Chrome browser. No special hardware.
