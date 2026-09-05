import { useEffect, useRef } from "react";
import { useVibe, useChannel } from "@vibe/react";

/**
 * Real-time audio visualizer: a full-screen frequency-bar + radial-pulse layer driven by a Web
 * Audio AnalyserNode on the playing track. Screen-blended so it glows over the dark sections.
 * Layered on top of the choreography — this is the "very active" visualizer, not a filter.
 */
export function Visualizer() {
  const { audio, playing, motion } = useVibe();
  const pulse = useChannel("pulse");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const a = audio;
    if (!a) return;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaElementSource(a);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (e) {
      console.error("[vibe] visualizer audio graph failed", e);
    }
    return () => {
      analyserRef.current = null;
      ctxRef.current = null;
      void ctx?.close().catch(() => {});
    };
  }, [audio]);

  useEffect(() => {
    if (playing) void ctxRef.current?.resume().catch(() => {});
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(512);
    const wave = new Uint8Array(512);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      g.clearRect(0, 0, canvas.width, canvas.height);
      const analyser = analyserRef.current;
      if (!analyser || motion === "minimal") return;

      const w = canvas.width;
      const h = canvas.height;
      const t = performance.now() / 1000;
      const bins = analyser.frequencyBinCount;

      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave);

      // --- bass energy for the radial pulse ---
      let bass = 0;
      for (let i = 0; i < 10 && i < bins; i++) bass += freq[i] / 255;
      bass /= 10;

      // --- radial pulse ring (center) ---
      const cx = w / 2;
      const cy = h / 2;
      const ringR = (0.18 + bass * 0.5) * Math.min(w, h);
      g.save();
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 14 * dpr;
      g.beginPath();
      g.arc(cx, cy, ringR, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = `hsla(${(t * 80) % 360} 100% 60% / 0.9)`;
      g.lineWidth = 6 * dpr;
      g.shadowColor = `hsl(${(t * 80) % 360} 100% 60%)`;
      g.shadowBlur = 30 * dpr;
      g.beginPath();
      g.arc(cx, cy, ringR, 0, Math.PI * 2);
      g.stroke();
      g.restore();

      // --- waveform thread across the middle ---
      g.save();
      g.strokeStyle = `hsla(${(t * 120 + 180) % 360} 100% 65% / 0.7)`;
      g.lineWidth = 2 * dpr;
      g.beginPath();
      for (let i = 0; i < analyser.fftSize; i += 4) {
        const x = (i / analyser.fftSize) * w;
        const v = wave[i] / 128 - 1;
        const y = cy + v * h * 0.2;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();

      // --- frequency bars (bottom edge, full width) ---
      const barCount = 56;
      const gap = w / barCount;
      const barW = gap * 0.72;
      const amp = motion === "reduced" ? 0.4 : 1;
      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * bins * 0.72);
        const v = freq[idx] / 255;
        const bh = Math.max(2 * dpr, v * v * h * 0.75 * amp);
        const x = i * gap;
        const y = h - bh;
        const hue = (t * 90 + i * 6) % 360;
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillRect(x + 3 * dpr, y + 3 * dpr, barW, bh);
        g.fillStyle = `hsl(${hue} 100% 55%)`;
        g.fillRect(x, y, barW, bh);
        g.fillStyle = `hsla(${hue} 100% 80% / 0.85)`;
        g.fillRect(x, y, barW, Math.min(bh, 5 * dpr));
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [motion, playing]);

  const flash = Math.max(0, (pulse - 0.55) * 2.2);

  if (!playing) return null;

  return (
    <>
      <canvas ref={canvasRef} className="v-viz" />
      <div className="v-strobe" style={{ opacity: (flash * 0.5).toFixed(3) }} />
    </>
  );
}
