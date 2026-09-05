import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useVibe } from "./context";

interface WorldProps {
  children?: ReactNode;
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

interface RectMap {
  [name: string]: DOMRect;
}

/**
 * The top-level layout owner. Holds the real grid-template-areas and swaps it wholesale when a
 * cut fires. Children declare which named area they occupy per scene via `vibeName`, and World
 * reassigns them. Cut transitions use FLIP (capture -> invert -> play) so reflow lands as a
 * scheduled, GPU-cheap punctuation, not a jarring edit.
 */
export function World({ children, gap = "16px", className, style }: WorldProps) {
  const { engine, state } = useVibe();
  const ref = useRef<HTMLDivElement>(null);
  const firstRects = useRef<RectMap>({});
  const animating = useRef(false);

  const scene = engine.getScene(state.sceneId);

  // Capture "first" positions the instant a cut fires (old layout still in DOM).
  useLayoutEffect(() => {
    return engine.onCut(({ cut }) => {
      if (cut.style === "hard") return;
      const map: RectMap = {};
      const el = ref.current;
      if (!el) return;
      el.querySelectorAll<HTMLElement>("[data-vibe-name]").forEach((node) => {
        const name = node.dataset.vibeName;
        if (name) map[name] = node.getBoundingClientRect();
      });
      firstRects.current = map;
      animating.current = true;
    });
  }, [engine]);

  // After the scene swap commits, compute "last" and play the inverse.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animating.current) return;
    const first = firstRects.current;
    if (!Object.keys(first).length) return;

    el.querySelectorAll<HTMLElement>("[data-vibe-name]").forEach((node) => {
      const name = node.dataset.vibeName;
      if (!name) return;
      const f = first[name];
      if (!f) return;
      const l = node.getBoundingClientRect();
      const dx = f.left - l.left;
      const dy = f.top - l.top;
      const dsx = l.width ? f.width / l.width : 1;
      const dsy = l.height ? f.height / l.height : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(dsx - 1) < 0.001 && Math.abs(dsy - 1) < 0.001) return;
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${dsx}, ${dsy})`, opacity: 0.7 },
          { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
        ],
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    animating.current = false;
  }, [scene?.id]);

  const areas = scene?.areas;
  const assignment = scene?.assignment ?? {};

  const gridStyle: CSSProperties = {
    ...style,
    display: "grid",
    gap,
    gridTemplateAreas: areas,
    gridTemplateColumns: scene?.columns ?? "1fr 1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: scene?.rows ?? "auto",
  };

  const kids = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const props = child.props as { vibeName?: string; "data-vibe-name"?: string };
    const name = props.vibeName ?? props["data-vibe-name"];
    if (!name || !assignment[name]) return child;
    return cloneElement(child as React.ReactElement<{ style?: CSSProperties }>, {
      style: { ...(child.props as { style?: CSSProperties }).style, gridArea: assignment[name] },
    });
  });

  return (
    <div ref={ref} className={className ? `v-world ${className}` : "v-world"} style={gridStyle}>
      {kids}
    </div>
  );
}
