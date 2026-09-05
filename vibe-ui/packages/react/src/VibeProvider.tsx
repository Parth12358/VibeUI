import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChoreographyEngine, type Choreography, type EngineState, type MotionMode } from "@vibe/core";
import { VibeContext } from "./context";

export interface VibeProviderProps {
  choreography: Choreography | string;
  track: string;
  tier?: string;
  motion?: MotionMode;
  autoPlay?: boolean;
  children?: ReactNode;
}

const EMPTY_STATE: EngineState = {
  t: 0,
  duration: 0,
  energy: 0,
  section: null,
  sceneId: null,
  paletteId: null,
  channels: {},
};

export function VibeProvider({ choreography, track, tier, motion: initialMotion = "full", autoPlay = false, children }: VibeProviderProps) {
  const [doc, setDoc] = useState<Choreography | null>(typeof choreography === "string" ? null : choreography);
  const [motion, setMotion] = useState<MotionMode>(initialMotion);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio(track);
    audioRef.current.loop = true;
    audioRef.current.preload = "auto";
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && track) {
      audio.src = track;
      audio.loop = true;
    }
  }, [track]);

  useEffect(() => {
    if (typeof choreography === "string") {
      fetch(choreography)
        .then((r) => r.json())
        .then(setDoc)
        .catch((e) => console.error("[vibe] failed to load choreography", e));
    }
  }, [choreography]);

  const engine = useMemo(() => {
    if (!doc) return null;
    return new ChoreographyEngine(doc, {
      clock: () => (audioRef.current ? audioRef.current.currentTime * 1000 : performance.now()),
      tier,
      motion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tier]);

  useEffect(() => {
    if (!engine) return;
    engine.start();
    return () => engine.destroy();
  }, [engine]);

  useEffect(() => {
    engine?.setMotion(motion);
  }, [motion, engine]);

  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    if (autoPlay) audio.play().catch(() => {});
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [track, autoPlay]);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);
  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);
  const seek = useCallback((tMs: number) => {
    if (audioRef.current) audioRef.current.currentTime = tMs / 1000;
  }, []);

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => engine?.subscribe(cb) ?? (() => {}), [engine]),
    () => engine?.getSnapshot() ?? EMPTY_STATE,
  );

  const value = useMemo(
    () => ({ engine: engine!, state, playing, audio: audioRef.current, play, pause, seek, motion, setMotion }),
    [engine, state, playing, play, pause, seek, motion],
  );

  if (!engine) {
    return <div className="vibe-loading">choreographing…</div>;
  }

  return <VibeContext.Provider value={value}>{children}</VibeContext.Provider>;
}
