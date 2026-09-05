import type {
  Choreography,
  Modulator,
  Hit,
  Section,
  Scene,
  Cut,
  Palette,
  PaletteTransition,
} from "../schema/types";
import { evaluateWaveform } from "./waveforms";
import { enforceBudget, DEFAULT_DESKTOP_BUDGET, type CostBudget } from "../schema/validate";

export type MotionMode = "full" | "reduced" | "minimal";

export interface EngineState {
  /** Absolute track time in ms. */
  t: number;
  duration: number;
  /** Current section energy in [0, 1]. */
  energy: number;
  section: Section | null;
  sceneId: string | null;
  paletteId: string | null;
  /** Per-channel summed modulator output, roughly [-1, 1], impulse can exceed. */
  channels: Record<string, number>;
}

export interface EngineOptions {
  /** Returns absolute track time in ms. Defaults to a wall-clock virtual clock. */
  clock?: () => number;
  /** Device tier to resolve (uses tiers.<name> modulators/scenes). */
  tier?: string;
  /** Per-cost-class budget applied to the modulator stack. */
  budget?: CostBudget;
  motion?: MotionMode;
}

export interface CutEvent {
  cut: Cut;
  from: Scene | null;
  to: Scene | null;
}

export interface PaletteEvent {
  transition: PaletteTransition;
  from: Palette | null;
  to: Palette | null;
}

const MOTION_AMP: Record<MotionMode, number> = {
  full: 1,
  reduced: 0.35,
  minimal: 0.1,
};

/**
 * The running simulation: an always-on modulator stack driven by a single rAF loop.
 * It composes the "jam" — continuous waves with additive hits, sections scaling amplitude,
 * and discrete scene/palette cuts layered on top — never a cut list.
 */
export class ChoreographyEngine {
  private choreography: Choreography;
  private modulators: Modulator[];
  private hits: Hit[];
  private sections: Section[];
  private scenes: Scene[];
  private cuts: Cut[];
  private palettes: Palette[];
  private paletteTransitions: PaletteTransition[];

  private hitsByModulator: Map<string, Hit[]> = new Map();

  private clock: () => number;
  private motion: MotionMode;

  private raf = 0;
  private running = false;
  private lastT = 0;

  private state: EngineState;
  private listeners = new Set<(s: EngineState) => void>();
  private cutListeners = new Set<(e: CutEvent) => void>();
  private paletteListeners = new Set<(e: PaletteEvent) => void>();

  private virtualStart = 0;

  constructor(choreography: Choreography, options: EngineOptions = {}) {
    this.choreography = choreography;

    const tier = options.tier ? choreography.tiers?.[options.tier] : undefined;
    let modulators = tier?.modulators ?? choreography.modulators;
    const scenes = tier?.scenes ?? choreography.scenes;
    const budget = options.budget ?? (options.tier === "mobile" ? { composite: 6, paint: 2, layout: 1 } : DEFAULT_DESKTOP_BUDGET);
    if (options.budget || options.tier) {
      modulators = enforceBudget(modulators, budget);
    }

    this.modulators = modulators;
    this.scenes = scenes;
    this.hits = choreography.hits ?? [];
    this.sections = [...(choreography.sections ?? [])].sort((a, b) => a.start - b.start);
    this.cuts = [...(choreography.cuts ?? [])].sort((a, b) => a.time - b.time);
    this.palettes = choreography.palettes ?? [];
    this.paletteTransitions = [...(choreography.paletteTransitions ?? [])].sort((a, b) => a.time - b.time);

    for (const h of this.hits) {
      const list = this.hitsByModulator.get(h.target) ?? [];
      list.push(h);
      this.hitsByModulator.set(h.target, list);
    }

    this.virtualStart = 0;
    this.clock = options.clock ?? (() => performance.now() - this.virtualStart);
    this.motion = options.motion ?? "full";

    this.state = {
      t: 0,
      duration: choreography.meta.durationMs,
      energy: 0,
      section: null,
      sceneId: this.sceneAt(0),
      paletteId: this.paletteAt(0),
      channels: {},
    };
  }

  get duration(): number {
    return this.choreography.meta.durationMs;
  }

  getScene(id: string | null): Scene | null {
    if (!id) return null;
    return this.scenes.find((s) => s.id === id) ?? null;
  }

  getPalette(id: string | null): Palette | null {
    if (!id) return null;
    return this.palettes.find((p) => p.id === id) ?? null;
  }

  getSnapshot = (): EngineState => this.state;

  subscribe = (listener: (s: EngineState) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  };

  onCut = (listener: (e: CutEvent) => void): (() => void) => {
    this.cutListeners.add(listener);
    return () => this.cutListeners.delete(listener);
  };

  onPalette = (listener: (e: PaletteEvent) => void): (() => void) => {
    this.paletteListeners.add(listener);
    return () => this.paletteListeners.delete(listener);
  };

  setMotion(motion: MotionMode): void {
    this.motion = motion;
  }

  /** Begin the virtual clock at a given time (used when no audio clock is supplied). */
  setVirtualStart(tMs = 0): void {
    this.virtualStart = performance.now() - tMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.virtualStart = performance.now();
    this.lastT = this.clock();
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.pause();
    this.listeners.clear();
    this.cutListeners.clear();
    this.paletteListeners.clear();
  }

  private sectionAt(t: number): Section | null {
    for (const s of this.sections) {
      if (t >= s.start && t < s.end) return s;
    }
    return this.sections.length ? this.sections[this.sections.length - 1] : null;
  }

  private sceneAt(t: number): string | null {
    let scene = this.scenes[0]?.id ?? null;
    const firstSectionScene = this.sections.find((s) => s.scene)?.scene;
    if (firstSectionScene) scene = firstSectionScene;
    const firstCutFrom = this.cuts[0]?.from;
    if (firstCutFrom) scene = firstCutFrom;
    for (const cut of this.cuts) {
      if (cut.time <= t) scene = cut.to;
    }
    return scene;
  }

  private paletteAt(t: number): string | null {
    let palette = this.palettes[0]?.id ?? null;
    const firstSectionPalette = this.sections.find((s) => s.palette)?.palette;
    if (firstSectionPalette) palette = firstSectionPalette;
    const firstFrom = this.paletteTransitions[0]?.from;
    if (firstFrom) palette = firstFrom;
    for (const tr of this.paletteTransitions) {
      if (tr.time <= t) palette = tr.to;
    }
    return palette;
  }

  private tick(): void {
    const t = this.clock();
    const dt = t - this.lastT;
    this.lastT = t;

    const section = this.sectionAt(t);
    const energy = section?.energy ?? 0;

    const channels: Record<string, number> = {};
    const ampScale = MOTION_AMP[this.motion];

    for (const m of this.modulators) {
      const base = evaluateWaveform(m.waveform, m.phase, m.period, t);
      // "Never idle": energy scales amplitude but never toggles motion off. The floor keeps
      // even the quietest verse visibly drifting (otherwise calm sections damp to nothing).
      const energyAmp = m.amplitudeSource === "energy" ? 0.5 + 0.5 * energy : 1;
      const amp = m.amplitude * energyAmp;
      let impulse = 0;
      const modHits = this.hitsByModulator.get(m.id);
      if (modHits) {
        for (const h of modHits) {
          if (t >= h.time) impulse += h.impulse * Math.exp(-(t - h.time) / h.decay);
        }
      }
      let v = (base * amp + impulse) * ampScale;
      // Flash-rate / amplitude clamp: never let a summed channel run away.
      v = Math.max(-1.5, Math.min(1.5, v));
      channels[m.target] = (channels[m.target] ?? 0) + v;
    }

    // Clamp summed channels (polyrhythm + many modulators must not exceed safe range).
    for (const k of Object.keys(channels)) {
      channels[k] = Math.max(-1, Math.min(1, channels[k]));
    }

    const next: EngineState = {
      t,
      duration: this.choreography.meta.durationMs,
      energy,
      section,
      sceneId: this.sceneAt(t),
      paletteId: this.paletteAt(t),
      channels,
    };

    // Fire discrete events on crossing (hysteresis via lastT).
    if (dt >= 0) {
      for (const cut of this.cuts) {
        if (this.lastT - dt <= cut.time && t >= cut.time) {
          this.emitCut(cut);
        }
      }
      for (const tr of this.paletteTransitions) {
        if (this.lastT - dt <= tr.time && t >= tr.time) {
          this.emitPalette(tr);
        }
      }
    }

    this.state = next;
    for (const l of this.listeners) l(next);
  }

  private emitCut(cut: Cut): void {
    const from = this.scenes.find((s) => s.id === cut.from) ?? null;
    const to = this.scenes.find((s) => s.id === cut.to) ?? null;
    for (const l of this.cutListeners) l({ cut, from, to });
  }

  private emitPalette(transition: PaletteTransition): void {
    const from = this.palettes.find((p) => p.id === transition.from) ?? null;
    const to = this.palettes.find((p) => p.id === transition.to) ?? null;
    for (const l of this.paletteListeners) l({ transition, from, to });
  }
}
