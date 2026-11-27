/**
 * The app mark: a bold "ID" drawn from shapes rather than a font (the image
 * renderer only ships a regular-weight font). `size` is the icon's width in px.
 */
export function IdMark({ size }: { size: number }) {
  const u = size / 512; // designed on a 512px canvas
  const height = 230 * u;
  const stroke = 56 * u;
  const color = "#f2f0ee";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 34 * u,
        background: "#1a1817",
      }}
    >
      {/* I */}
      <div style={{ width: stroke, height, background: color, borderRadius: 4 * u }} />
      {/* D */}
      <div
        style={{
          width: 170 * u,
          height,
          border: `${stroke}px solid ${color}`,
          borderRadius: `${8 * u}px ${height / 2}px ${height / 2}px ${8 * u}px`,
        }}
      />
    </div>
  );
}

/** The mark as a small rounded tile, for use inside the app (e.g. the sidebar). */
export function AppMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden rounded-md ring-1 ring-stone-300"
      style={{ width: size, height: size }}
    >
      <IdMark size={size} />
    </span>
  );
}
