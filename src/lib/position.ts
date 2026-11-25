/** Position for an item dropped between `prev` and `next` (either may be missing). */
export function positionBetween(prev: number | undefined, next: number | undefined) {
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return next! - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}
