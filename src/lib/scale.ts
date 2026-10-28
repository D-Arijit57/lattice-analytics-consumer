/** Round axis ticks from 0 up to at least `max` (about `count` steps). Always returns [0, ...] even when max is 0. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Linear mapping of day strings (YYYY-MM-DD, UTC) to [0,1] by real elapsed time, so gaps stay visible. */
export function dayPositions(days: string[]): Map<string, number> {
  const t = days.map((d) => Date.parse(`${d}T00:00:00Z`));
  const lo = Math.min(...t);
  const span = Math.max(...t) - lo || 1;
  return new Map(days.map((d, i) => [d, (t[i] - lo) / span]));
}
