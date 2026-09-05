import { createContext, useContext } from "react";
import type { ChoreographyEngine, EngineState, MotionMode } from "@vibe/core";

export interface VibeContextValue {
  engine: ChoreographyEngine;
  state: EngineState;
  playing: boolean;
  audio: HTMLAudioElement | null;
  play: () => void;
  pause: () => void;
  seek: (tMs: number) => void;
  motion: MotionMode;
  setMotion: (m: MotionMode) => void;
}

export const VibeContext = createContext<VibeContextValue | null>(null);

export function useVibe(): VibeContextValue {
  const ctx = useContext(VibeContext);
  if (!ctx) throw new Error("V.* components must be rendered inside <VibeProvider>");
  return ctx;
}

/** Read a channel's current value, optionally scaled by sensitivity. */
export function useChannel(name: string, sensitivity = 1): number {
  const { state } = useVibe();
  return (state.channels[name] ?? 0) * sensitivity;
}
