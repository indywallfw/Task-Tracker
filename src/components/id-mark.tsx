/** The IndypenDance logo ("Shield note") as a small navy tile, for use inside the app (e.g. the sidebar). */
export function AppMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/tile.svg" alt="" aria-hidden width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
  );
}
