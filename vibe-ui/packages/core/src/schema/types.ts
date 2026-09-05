export type Waveform = "sine" | "triangle" | "perlin";
export type Cost = "composite" | "paint" | "layout";
export type AmplitudeSource = "energy" | "fixed";
export type CutStyle = "hard" | "flip" | "blend";
export type PaletteTransitionStyle = "hard" | "blend";

export const SCHEMA_VERSION = "1.0";

export interface Modulator {
  id: string;
  waveform: Waveform;
  /** Seconds for one full cycle of the wave. */
  period: number;
  /** Phase offset in [0, 1). Deliberately not phase-locked to other modulators. */
  phase: number;
  /** The named channel this modulator writes to. Many modulators may share a channel. */
  target: string;
  amplitudeSource: AmplitudeSource;
  /** Base amplitude in [0, 1]. Scaled by section energy when amplitudeSource === "energy". */
  amplitude: number;
  /** Performance cost class. Enforced by the engine's per-tier budget. */
  cost: Cost;
}

export interface Hit {
  /** Absolute time in milliseconds. */
  time: number;
  /** Modulator id this impulse perturbs. */
  target: string;
  /** Impulse magnitude in [0, 1]. */
  impulse: number;
  /** Exponential decay time constant in milliseconds. */
  decay: number;
}

export interface Section {
  id: string;
  start: number;
  end: number;
  /** Energy level in [0, 1]. Scales the whole modulator stack, never toggles it off. */
  energy: number;
  /** Named scene to stage this section in, if any. */
  scene?: string;
  /** Named palette to play under this section, if any. */
  palette?: string;
}

export interface SceneBreakpoint {
  areas: string;
  columns?: string;
  rows?: string;
}

export interface Scene {
  id: string;
  /** CSS grid-template-areas value. */
  areas: string;
  columns?: string;
  rows?: string;
  /** childId -> named grid area. V.World reassigns children per scene. */
  assignment: Record<string, string>;
  /** Per-breakpoint overrides so mobile gets a reduced scene set without a second deck. */
  breakpoints?: Record<string, SceneBreakpoint>;
}

export interface Cut {
  /** Absolute time in milliseconds. */
  time: number;
  from: string;
  to: string;
  style: CutStyle;
  /** Transition duration in milliseconds. */
  duration: number;
  easing?: string;
  /** elementId eligible as the FLIP/view-transition lead (V.Anchor). */
  lead?: string;
}

export interface Palette {
  id: string;
  /** CSS custom property values, e.g. { "--color-bg": "#0b0b12" }. */
  tokens: Record<string, string>;
}

export interface PaletteTransition {
  time: number;
  from: string;
  to: string;
  style: PaletteTransitionStyle;
  duration: number;
}

export interface Trails {
  /** Feedback/afterimage decay in [0, 1). Higher = longer trails. */
  decay: number;
  /** Which token names ghost (targeted at the trail renderer). */
  ghost: string[];
}

export interface Tier {
  modulators: Modulator[];
  scenes: Scene[];
}

export interface ChoreographyMeta {
  fingerprint?: string;
  bpm?: number;
  durationMs: number;
  genre?: string;
  mood?: string;
  title?: string;
}

export interface Choreography {
  version: string;
  meta: ChoreographyMeta;
  /** Optional per-device-tier overrides. The client selects the tier. */
  tiers?: Record<string, Tier>;
  modulators: Modulator[];
  hits: Hit[];
  sections: Section[];
  scenes: Scene[];
  cuts: Cut[];
  palettes: Palette[];
  paletteTransitions: PaletteTransition[];
  trails: Trails;
  /** Optional downsampled energy curve in [0, 1], for client-side use. */
  energy?: number[];
}
