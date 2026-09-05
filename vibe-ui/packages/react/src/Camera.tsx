import type { CSSProperties, ReactNode } from "react";
import { useChannel } from "./context";

/**
 * A single transform wrapper around the whole viewport. Pure transform/opacity — never layout.
 * Carries the "jam" drift: continuous sway, zoom, and shake, even when the world below is calm.
 */
export function Camera({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  const x = useChannel("camX");
  const y = useChannel("camY");
  const zoom = useChannel("camZ");
  const shake = useChannel("shake");

  const tx = x * 60 + shake * 5;
  const ty = y * 48 + shake * 4;
  const scale = 1 + zoom * 0.16;
  const rotate = x * 4 + shake * 1.5;
  const skewX = y * 3;
  const skewY = x * 2;

  const merged: CSSProperties = {
    ...style,
    transform: `translate3d(${tx.toFixed(3)}px, ${ty.toFixed(3)}px, 0) scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(3)}deg) skew(${skewX.toFixed(3)}deg, ${skewY.toFixed(3)}deg)`,
    willChange: "transform",
  };

  return (
    <div className={className ? `v-camera ${className}` : "v-camera"} style={merged}>
      {children}
    </div>
  );
}
