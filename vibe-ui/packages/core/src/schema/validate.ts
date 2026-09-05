import type { Choreography, Modulator, Hit, Section, Scene, Cut, Palette } from "./types";
import { SCHEMA_VERSION } from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function err(path: string, message: string): ValidationIssue {
  return { path, message };
}

const WAVEFORMS = new Set(["sine", "triangle", "perlin"]);
const COSTS = new Set(["composite", "paint", "layout"]);
const CUT_STYLES = new Set(["hard", "flip", "blend"]);
const PALETTE_STYLES = new Set(["hard", "blend"]);

/**
 * Lightweight schema validator. Enforces shape + the "guardrails that survive the pivot":
 * - sum-amplitude clamp is a runtime concern, but we flag pathological single-amplitude values.
 * - contrast floor is checked here when palettes carry a minimum text/background ratio hint.
 */
export function validateChoreography(c: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof c !== "object" || c === null) {
    return { valid: false, issues: [err("$", "choreography must be an object")] };
  }
  const ch = c as Choreography;

  if (ch.version !== SCHEMA_VERSION) {
    issues.push(err("version", `expected "${SCHEMA_VERSION}", got "${ch.version}"`));
  }
  if (!ch.meta || typeof ch.meta.durationMs !== "number" || ch.meta.durationMs <= 0) {
    issues.push(err("meta.durationMs", "must be a positive number"));
  }

  for (const [i, m] of (ch.modulators ?? []).entries()) {
    const p = `modulators[${i}]`;
    if (!m.id) issues.push(err(`${p}.id`, "required"));
    if (!WAVEFORMS.has(m.waveform)) issues.push(err(`${p}.waveform`, `invalid "${m.waveform}"`));
    if (typeof m.period !== "number" || m.period <= 0) issues.push(err(`${p}.period`, "must be > 0"));
    if (typeof m.phase !== "number" || m.phase < 0 || m.phase >= 1) issues.push(err(`${p}.phase`, "must be in [0,1)"));
    if (!m.target) issues.push(err(`${p}.target`, "required"));
    if (m.amplitudeSource !== "energy" && m.amplitudeSource !== "fixed") issues.push(err(`${p}.amplitudeSource`, `invalid "${m.amplitudeSource}"`));
    if (typeof m.amplitude !== "number" || m.amplitude < 0 || m.amplitude > 1) issues.push(err(`${p}.amplitude`, "must be in [0,1]"));
    if (!COSTS.has(m.cost)) issues.push(err(`${p}.cost`, `invalid "${m.cost}"`));
  }

  for (const [i, h] of (ch.hits ?? []).entries()) {
    const p = `hits[${i}]`;
    if (typeof h.time !== "number" || h.time < 0) issues.push(err(`${p}.time`, "must be >= 0"));
    if (!h.target) issues.push(err(`${p}.target`, "required"));
    if (typeof h.impulse !== "number") issues.push(err(`${p}.impulse`, "required"));
    if (typeof h.decay !== "number" || h.decay <= 0) issues.push(err(`${p}.decay`, "must be > 0"));
  }

  let prevEnd = 0;
  const sections = (ch.sections ?? []) as Section[];
  sections.sort((a, b) => a.start - b.start);
  for (const [i, s] of sections.entries()) {
    const p = `sections[${i}]`;
    if (!s.id) issues.push(err(`${p}.id`, "required"));
    if (typeof s.start !== "number" || s.start < 0) issues.push(err(`${p}.start`, "must be >= 0"));
    if (typeof s.end !== "number" || s.end <= s.start) issues.push(err(`${p}.end`, "must be > start"));
    if (typeof s.energy !== "number" || s.energy < 0 || s.energy > 1) issues.push(err(`${p}.energy`, "must be in [0,1]"));
    prevEnd = Math.max(prevEnd, s.end);
  }
  if (ch.meta?.durationMs && sections.length && prevEnd < ch.meta.durationMs - 1000) {
    issues.push(err("sections", "sections do not cover the track duration"));
  }

  const sceneIds = new Set((ch.scenes ?? []).map((s) => s.id));
  for (const [i, s] of (ch.scenes ?? []).entries()) {
    const p = `scenes[${i}]`;
    if (!s.id) issues.push(err(`${p}.id`, "required"));
    if (typeof s.areas !== "string" || !s.areas.length) issues.push(err(`${p}.areas`, "required"));
  }

  for (const [i, c2] of (ch.cuts ?? []).entries()) {
    const p = `cuts[${i}]`;
    if (typeof c2.time !== "number" || c2.time < 0) issues.push(err(`${p}.time`, "must be >= 0"));
    if (c2.from && !sceneIds.has(c2.from)) issues.push(err(`${p}.from`, `unknown scene "${c2.from}"`));
    if (!sceneIds.has(c2.to)) issues.push(err(`${p}.to`, `unknown scene "${c2.to}"`));
    if (!CUT_STYLES.has(c2.style)) issues.push(err(`${p}.style`, `invalid "${c2.style}"`));
  }

  const paletteIds = new Set((ch.palettes ?? []).map((p) => p.id));
  for (const [i, p] of (ch.palettes ?? []).entries()) {
    const path = `palettes[${i}]`;
    if (!p.id) issues.push(err(`${path}.id`, "required"));
    const keys = Object.keys(p.tokens ?? {});
    if (!keys.length) issues.push(err(`${path}.tokens`, "must define at least one token"));
    const contrast = p.tokens["--contrast-hint"];
    if (contrast !== undefined && Number(contrast) < 4.5) {
      issues.push(err(`${path}.tokens.--contrast-hint`, "below WCAG AA text contrast floor (4.5)"));
    }
  }

  for (const [i, t] of (ch.paletteTransitions ?? []).entries()) {
    const p = `paletteTransitions[${i}]`;
    if (typeof t.time !== "number") issues.push(err(`${p}.time`, "required"));
    if (t.from && !paletteIds.has(t.from)) issues.push(err(`${p}.from`, `unknown palette "${t.from}"`));
    if (!paletteIds.has(t.to)) issues.push(err(`${p}.to`, `unknown palette "${t.to}"`));
    if (!PALETTE_STYLES.has(t.style)) issues.push(err(`${p}.style`, `invalid "${t.style}"`));
  }

  // Cross-references: sections must reference known scenes/palettes.
  for (const s of sections) {
    if (s.scene && !sceneIds.has(s.scene)) issues.push(err(`sections.${s.id}.scene`, `unknown scene "${s.scene}"`));
    if (s.palette && !paletteIds.has(s.palette)) issues.push(err(`sections.${s.id}.palette`, `unknown palette "${s.palette}"`));
  }

  return { valid: issues.length === 0, issues };
}

/** Budget enforcement: clamp a tier's modulator stack by cost class (flat counts are the wrong unit). */
export interface CostBudget {
  composite: number;
  paint: number;
  layout: number;
}

export const DEFAULT_DESKTOP_BUDGET: CostBudget = { composite: 12, paint: 6, layout: 2 };
export const DEFAULT_MOBILE_BUDGET: CostBudget = { composite: 6, paint: 2, layout: 1 };

export function enforceBudget(modulators: Modulator[], budget: CostBudget): Modulator[] {
  const counts: Record<string, number> = { composite: 0, paint: 0, layout: 0 };
  return modulators.filter((m) => {
    if (counts[m.cost] >= budget[m.cost]) return false;
    counts[m.cost]++;
    return true;
  });
}

export type { Modulator, Hit, Section, Scene, Cut, Palette };
