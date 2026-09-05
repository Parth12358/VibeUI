import type { CSSProperties, ReactNode } from "react";
import { useVibe } from "./context";

/**
 * Owns the CSS custom properties for color. Swaps the site's real design tokens to the current
 * named palette on section boundaries, crossfading via registered @property. Distinct from
 * V.Post's continuous hue drift — this is the site *transforming*, not a filter on top.
 */
export function Palette({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  const { engine, state } = useVibe();
  const palette = engine.getPalette(state.paletteId);

  const vars = (palette?.tokens ?? {}) as Record<string, string>;

  return (
    <div className={className ? `v-palette ${className}` : "v-palette"} style={{ ...style, ...vars }}>
      {children}
    </div>
  );
}
