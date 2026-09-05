import type { CSSProperties, ReactNode } from "react";
import { useChannel } from "./context";

/**
 * Post-processing overlay: the primary carrier of the "high" feeling. Continuous hue-cycle,
 * saturation, brightness, contrast, and breathing defocus (blur), plus a color-wash layer that
 * tints even the dark sections. Filter + blend only, never touches layout.
 */
export function Post({ children, className, style }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  const hue = useChannel("hue");
  const sat = useChannel("sat");
  const light = useChannel("light");
  const contrast = useChannel("contrast");

  const washHue = Math.round(((hue + 1) / 2) * 360);
  const filter =
    `hue-rotate(${(hue * 180).toFixed(1)}deg) ` +
    `saturate(${Math.max(0.6, 1 + sat * 1.2).toFixed(3)}) ` +
    `contrast(${(1 + contrast * 0.5).toFixed(3)}) ` +
    `brightness(${(1 + light * 0.4).toFixed(3)})`;

  const merged: CSSProperties = { ...style, filter };

  return (
    <div className={className ? `v-post ${className}` : "v-post"} style={merged}>
      {children}
      <div className="v-wash" style={{ backgroundColor: `hsl(${washHue} 90% 55%)`, opacity: 0.32 }} />
      <div className="v-wash v-wash-2" style={{ backgroundColor: `hsl(${(washHue + 180) % 360} 90% 55%)` }} />
    </div>
  );
}
