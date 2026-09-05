import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode } from "react";

/**
 * Marks an element as the designated FLIP/transition "lead" — the eye-guide that travels through
 * a cut so the viewer has something to follow instead of every element teleporting.
 */
export function Anchor({ children, style, ...rest }: { children?: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div {...rest} data-vibe-anchor style={style}>
      {children}
    </div>
  );
}

interface StageProps {
  children?: ReactNode;
  areas: string;
  columns?: string;
  rows?: string;
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A sub-region wrapper for compound layouts: a card grid that re-flows (3-up -> 1-up -> mosaic)
 * on its own cadence, independent of the page-level V.World cut. Children declare their area via
 * the `area` prop.
 */
export function Stage({ children, areas, columns, rows, gap = "12px", className, style }: StageProps) {
  const gridStyle: CSSProperties = {
    ...style,
    display: "grid",
    gap,
    gridTemplateAreas: areas,
    gridTemplateColumns: columns ?? "1fr 1fr 1fr",
    gridTemplateRows: rows ?? "auto",
    transition: "grid-template-areas 500ms cubic-bezier(0.22, 1, 0.36, 1)",
  };
  const kids = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const area = (child.props as { area?: string }).area;
    if (!area) return child;
    return cloneElement(child as React.ReactElement<{ style?: CSSProperties }>, {
      style: { ...(child.props as { style?: CSSProperties }).style, gridArea: area },
    });
  });
  return (
    <div className={className ? `v-stage ${className}` : "v-stage"} style={gridStyle}>
      {kids}
    </div>
  );
}

interface ReflowProps {
  children?: ReactNode;
  /** Child `vibeName` -> flex order. */
  order?: Record<string, number>;
  className?: string;
  style?: CSSProperties;
}

/**
 * Lightweight reorder/reveal wrapper — content shifts or hides with energy without a full
 * named-scene definition.
 */
export function Reflow({ children, order = {}, className, style }: ReflowProps) {
  const kids = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const name = (child.props as { vibeName?: string }).vibeName;
    if (!name || order[name] === undefined) return child;
    return cloneElement(child as React.ReactElement<{ style?: CSSProperties }>, {
      style: { ...(child.props as { style?: CSSProperties }).style, order: order[name] },
    });
  });
  return (
    <div className={className ? `v-reflow ${className}` : "v-reflow"} style={{ ...style, display: "flex", flexDirection: "column" }}>
      {kids}
    </div>
  );
}
