import type { CSSProperties } from "react";

export interface DishImageProps {
  /** A ready-to-use signed URL (`lib/image-url.ts`), or `null` for "no
   * photo" — never attempted, failed, timed out, or predates this feature;
   * all render the same neutral placeholder (FR-004). */
  src: string | null;
  alt: string;
  focalX?: number;
  focalY?: number;
  zoom?: number | null;
  /** Sizes the box this fills (aspect ratio, fixed thumbnail dimensions,
   * ...) — the placeholder and the loaded image occupy the identical box,
   * so there's no layout shift between them (FR-013). */
  style?: CSSProperties;
}

/** One shared box for both the final recipe tab's full image and the
 * session list's cropped thumbnail (`app/tokens.css`'s dish-image tokens) —
 * same placeholder treatment, same focal-point/zoom math, one code path. */
export function DishImage({ src, alt, focalX = 0.5, focalY = 0.5, zoom, style }: DishImageProps) {
  const boxStyle: CSSProperties = {
    borderRadius: "var(--dish-image-radius)",
    overflow: "hidden",
    background: "var(--dish-image-placeholder-bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...style,
  };

  if (!src) {
    return (
      <div style={boxStyle} aria-hidden="true" data-testid="dish-image">
        <PlaceholderGlyph />
      </div>
    );
  }

  return (
    <div style={boxStyle} data-testid="dish-image">
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${focalX * 100}% ${focalY * 100}%`,
          transform: zoom && zoom > 1 ? `scale(${zoom})` : undefined,
        }}
      />
    </div>
  );
}

/** Decorative only (the enclosing box is `aria-hidden`) — a plate-and-food
 * glyph, not a broken-image icon, so "no photo yet" reads as neutral rather
 * than as an error. */
function PlaceholderGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="40%" height="40%" style={{ color: "var(--color-text-muted)" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
