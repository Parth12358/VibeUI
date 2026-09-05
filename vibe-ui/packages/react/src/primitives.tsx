import { type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { useChannel } from "./context";

interface PrimitiveProps extends HTMLAttributes<HTMLElement> {
  vibeName?: string;
  sensitivity?: number;
  as?: keyof HTMLElementTagNameMap;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function dataName(vibeName?: string): { "data-vibe-name"?: string } {
  return vibeName ? { "data-vibe-name": vibeName } : {};
}

export function Hero({ children, vibeName, sensitivity = 1, style, ...rest }: PrimitiveProps) {
  const breath = useChannel("breath", sensitivity);
  const pulse = useChannel("pulse", sensitivity);
  const driftX = useChannel("driftX", sensitivity);
  const jump = pulse * 14;
  const merged: CSSProperties = {
    ...style,
    transform: `translate3d(${(driftX * 8).toFixed(2)}px, ${(-jump).toFixed(2)}px, 0) scale(${(1 + breath * 0.05 + Math.abs(pulse) * 0.08).toFixed(4)})`,
  };
  return (
    <section {...dataName(vibeName)} style={merged} {...rest}>
      {children}
    </section>
  );
}

export function Card({ children, vibeName, sensitivity = 1, baseRadius = 16, style, ...rest }: PrimitiveProps & { baseRadius?: number }) {
  const breath = useChannel("breath", sensitivity);
  const radius = useChannel("radius", sensitivity);
  const pulse = useChannel("pulse", sensitivity);
  const jump = pulse * 18;
  const merged: CSSProperties = {
    ...style,
    transform: `translateY(${(-jump).toFixed(2)}px) scale(${(1 + breath * 0.03 + Math.abs(pulse) * 0.1).toFixed(4)}) rotate(${(pulse * 1.5).toFixed(2)}deg)`,
    borderRadius: `${clamp(baseRadius + radius * 14, 0, 40)}px`,
    boxShadow: pulse > 0.05 ? `0 0 ${(pulse * 40).toFixed(1)}px rgba(255,45,149,${clamp(pulse * 0.5, 0, 0.6)})` : undefined,
  };
  return (
    <div {...dataName(vibeName)} style={merged} {...rest}>
      {children}
    </div>
  );
}

export function Button({ children, vibeName, sensitivity = 1, style, ...rest }: PrimitiveProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  const pulse = useChannel("pulse", sensitivity);
  const breath = useChannel("breath", sensitivity);
  const jump = pulse * 22;
  const merged: CSSProperties = {
    ...style,
    transform: `translateY(${(-jump).toFixed(2)}px) scale(${(1 + breath * 0.02 + Math.abs(pulse) * 0.22).toFixed(4)}) rotate(${(pulse * 3).toFixed(2)}deg)`,
  };
  return (
    <button type="button" {...dataName(vibeName)} style={merged} {...rest}>
      {children}
    </button>
  );
}

export function Text({ children, vibeName, sensitivity = 1, style, ...rest }: PrimitiveProps) {
  const kerning = useChannel("kerning", sensitivity);
  const breath = useChannel("breath", sensitivity);
  const pulse = useChannel("pulse", sensitivity);
  const ls = clamp(kerning * 0.08, -0.02, 0.1);
  const jump = pulse * 5;
  const merged: CSSProperties = {
    ...style,
    letterSpacing: `${ls.toFixed(4)}em`,
    transform: `translateY(${(-jump).toFixed(2)}px) scale(${(1 + breath * 0.015).toFixed(4)})`,
  };
  return (
    <span {...dataName(vibeName)} style={merged} {...rest}>
      {children}
    </span>
  );
}

export type { PrimitiveProps };
