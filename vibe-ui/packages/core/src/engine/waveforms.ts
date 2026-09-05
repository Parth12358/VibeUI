import type { Waveform } from "../schema/types";

const TAU = Math.PI * 2;

/** Deterministic 1D value noise with smooth interpolation. */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smoothstep interpolation between two hash values. */
function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i);
  const b = hash(i + 1);
  return a + (b - a) * u;
}

/**
 * Evaluate a waveform in the range [-1, 1].
 * @param phase in [0, 1)
 * @param period seconds per cycle
 * @param tMs absolute time in milliseconds
 */
export function evaluateWaveform(waveform: Waveform, phase: number, period: number, tMs: number): number {
  const tSec = tMs / 1000;
  switch (waveform) {
    case "sine":
      return Math.sin(TAU * (tSec / period + phase));
    case "triangle": {
      const p = (tSec / period + phase) % 1;
      return 4 * Math.abs(p - 0.5) - 1;
    }
    case "perlin": {
      // period maps to the "wavelength" of the noise field; phase offsets the sampling.
      const x = (tSec / period) * 2 + phase * 100;
      return valueNoise(x) * 2 - 1;
    }
    default:
      return 0;
  }
}
