import type { Choreography } from "@vibe/core";

/**
 * Client-side fallback choreographer for dropped audio. Estimates BPM, energy envelope, and onset
 * peaks from a decoded AudioBuffer, then composes a rough choreography using the same schema the
 * server pipeline produces. Keeps "drop any song" working with zero backend.
 */
export async function quickChoreography(buffer: AudioBuffer, title: string): Promise<Choreography> {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const hop = Math.floor(sr / 50); // ~20ms frames
  const frames = Math.floor(ch0.length / hop);

  const rms = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const start = i * hop;
    const end = Math.min(start + hop, ch0.length);
    for (let j = start; j < end; j++) {
      const v = ch1 ? (ch0[j] + ch1[j]) * 0.5 : ch0[j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / (end - start));
  }

  // Onset strength = positive energy delta (spectral-flux-ish).
  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i++) {
    onset[i] = Math.max(0, rms[i] - rms[i - 1]);
  }

  const bpm = estimateBpm(onset, frames, sr / hop);

  // Downsample energy to 64 points in [0,1].
  const energy: number[] = [];
  for (let k = 0; k < 64; k++) {
    const a = Math.floor((k / 64) * frames);
    const b = Math.floor(((k + 1) / 64) * frames);
    let s = 0;
    for (let i = a; i < b; i++) s += rms[i];
    energy.push(s / Math.max(1, b - a));
  }
  const maxE = Math.max(...energy) || 1;
  for (let k = 0; k < energy.length; k++) energy[k] = Math.min(1, energy[k] / maxE);

  const durationMs = Math.round((ch0.length / sr) * 1000);

  // Sections from energy thresholds.
  const sections = makeSections(energy, durationMs);
  const dropTime = energy.indexOf(Math.max(...energy)) * (durationMs / 64);

  // Hits from top onset peaks.
  const peakTimes = topPeaks(onset, frames, sr / hop, 48);
  const beat = 60 / (bpm || 120);

  const hits = peakTimes.map(({ t, strength }) => ({
    time: Math.round(t * 1000),
    target: "pulseBase",
    impulse: Math.min(1, 0.3 + strength * 1.4),
    decay: 180,
  }));

  const modulators = [
    { id: "hueDrift", waveform: "perlin", period: 8, phase: 0.0, target: "hue", amplitudeSource: "energy", amplitude: 1.0, cost: "paint" },
    { id: "hueFast", waveform: "sine", period: 3, phase: 0.4, target: "hue", amplitudeSource: "energy", amplitude: 0.5, cost: "paint" },
    { id: "satDrift", waveform: "sine", period: 4, phase: 0.25, target: "sat", amplitudeSource: "energy", amplitude: 0.8, cost: "paint" },
    { id: "lightDrift", waveform: "perlin", period: 10, phase: 0.3, target: "light", amplitudeSource: "energy", amplitude: 0.7, cost: "paint" },
    { id: "contrastDrift", waveform: "sine", period: 5, phase: 0.55, target: "contrast", amplitudeSource: "energy", amplitude: 0.7, cost: "paint" },
    { id: "breath", waveform: "sine", period: 3, phase: 0.0, target: "breath", amplitudeSource: "energy", amplitude: 0.8, cost: "composite" },
    { id: "radiusFlow", waveform: "triangle", period: 5, phase: 0.1, target: "radius", amplitudeSource: "energy", amplitude: 0.9, cost: "paint" },
    { id: "kerning", waveform: "perlin", period: 8, phase: 0.5, target: "kerning", amplitudeSource: "fixed", amplitude: 0.6, cost: "layout" },
    { id: "camX", waveform: "sine", period: 5, phase: 0.0, target: "camX", amplitudeSource: "energy", amplitude: 0.7, cost: "composite" },
    { id: "camY", waveform: "sine", period: 6, phase: 0.33, target: "camY", amplitudeSource: "energy", amplitude: 0.55, cost: "composite" },
    { id: "camZ", waveform: "perlin", period: 9, phase: 0.0, target: "camZ", amplitudeSource: "energy", amplitude: 0.8, cost: "composite" },
    { id: "pulseBase", waveform: "sine", period: beat, phase: 0.0, target: "pulse", amplitudeSource: "energy", amplitude: 0.25, cost: "composite" },
    { id: "shakeMod", waveform: "sine", period: beat, phase: 0.0, target: "shake", amplitudeSource: "fixed", amplitude: 0.1, cost: "composite" },
  ];

  const scenes = [
    { id: "grid", areas: '"c1 c2 c3 c4"', columns: "repeat(4, 1fr)", rows: "auto", assignment: { c1: "c1", c2: "c2", c3: "c3", c4: "c4" } },
    { id: "mosaic", areas: '"c1 c1 c2 c3" "c1 c1 c4 c4"', columns: "repeat(4, 1fr)", rows: "1fr 1fr", assignment: { c1: "c1", c2: "c2", c3: "c3", c4: "c4" } },
  ];

  const cuts = [
    { time: Math.round(dropTime), from: "grid", to: "mosaic", style: "flip", duration: 800, easing: "cubic-bezier(0.22,1,0.36,1)", lead: "c1" },
  ];

  const palettes = [
    { id: "calm", tokens: { "--color-bg": "#2f86d5", "--color-surface": "#ead9c8", "--color-accent": "#ffe62b", "--color-text": "#fff7ef", "--color-muted": "#0a0b08", "--contrast-hint": "9" } },
    { id: "trip", tokens: { "--color-bg": "#080b08", "--color-surface": "#2f86d5", "--color-accent": "#ff5b9e", "--color-text": "#ffe62b", "--color-muted": "#fff7ef", "--contrast-hint": "9" } },
  ];

  const paletteTransitions = [
    { time: Math.round(dropTime), from: "calm", to: "trip", style: "blend", duration: 2000 },
  ];

  return {
    version: "1.0",
    meta: { bpm: Math.round(bpm || 120), durationMs, title, genre: "auto" },
    modulators,
    hits,
    sections,
    scenes,
    cuts,
    palettes,
    paletteTransitions,
    trails: { decay: 0.85, ghost: ["accent"] },
    energy,
  } as Choreography;
}

function estimateBpm(onset: Float32Array, frames: number, fps: number): number {
  const minBpm = 70;
  const maxBpm = 180;
  let best = 120;
  let bestScore = -1;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
    const lag = Math.round((fps * 60) / bpm);
    if (lag < 2 || lag >= frames) continue;
    let score = 0;
    for (let i = lag; i < frames; i++) score += onset[i] * onset[i - lag];
    // Bias toward common tempos slightly.
    if (score > bestScore) {
      bestScore = score;
      best = bpm;
    }
  }
  return best;
}

function topPeaks(onset: Float32Array, frames: number, fps: number, count: number): { t: number; strength: number }[] {
  const threshold = 0.6 * Math.max(...Array.from(onset));
  const peaks: { t: number; strength: number }[] = [];
  for (let i = 2; i < frames - 1; i++) {
    if (onset[i] > threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
      peaks.push({ t: i / fps, strength: onset[i] });
    }
  }
  peaks.sort((a, b) => b.strength - a.strength);
  return peaks.slice(0, count).sort((a, b) => a.t - b.t);
}

function makeSections(energy: number[], durationMs: number) {
  const sections: { id: string; start: number; end: number; energy: number; scene: string; palette: string }[] = [];
  const pts = energy.map((e, i) => ({ e, t: Math.round((i / 64) * durationMs) }));
  const low = pts.filter((p) => p.e < 0.4);
  const mid = pts.filter((p) => p.e >= 0.4 && p.e < 0.7);
  const high = pts.filter((p) => p.e >= 0.7);

  const clusters = [
    { label: "verse", list: low, energy: 0.25, scene: "grid", palette: "calm" },
    { label: "build", list: mid, energy: 0.55, scene: "grid", palette: "calm" },
    { label: "drop", list: high, energy: 1.0, scene: "mosaic", palette: "trip" },
  ];

  let i = 0;
  for (const c of clusters) {
    if (!c.list.length) continue;
    const start = c.list[0].t;
    const end = c.list[c.list.length - 1].t + Math.round(durationMs / 64);
    sections.push({ id: `${c.label}${i++}`, start, end, energy: c.energy, scene: c.scene, palette: c.palette });
  }
  if (sections.length) {
    sections[0].start = 0;
    sections[sections.length - 1].end = durationMs;
  } else {
    sections.push({ id: "all", start: 0, end: durationMs, energy: 0.5, scene: "grid", palette: "calm" });
  }
  return sections;
}
