/**
 * Reproducible demonstration dataset: "daily page views" per content channel over 14 days.
 * Used by `npm run seed` (to create entries in a local Lattice) and by DEMO_MODE (as an explicit
 * fixture). It is never used as a fallback for a failed Lattice request.
 *
 * Deliberately imperfect: a few records have no status, no target or no category, so the board's
 * handling of optional fields is visible.
 */

export const DEMO_CONTENT_TYPE = {name: 'Metric Record', slug: 'metric-record'} as const;

/** Lattice has no datetime type, so `recorded_at` is a `date` field (validated as YYYY-MM-DD). */
export const DEMO_FIELDS = [
  {name: 'name', data_type: 'string', required: true},
  {name: 'value', data_type: 'number', required: true},
  {name: 'recorded_at', data_type: 'date', required: true},
  {name: 'category', data_type: 'string', required: false},
  {name: 'status', data_type: 'string', required: false},
  {name: 'target', data_type: 'number', required: false},
  {name: 'unit', data_type: 'string', required: false},
] as const;

const CHANNELS = [
  {category: 'Docs', base: 4200, target: 4500},
  {category: 'Blog', base: 2600, target: 3000},
  {category: 'Newsletter', base: 1500, target: 1500},
  {category: 'Social', base: 900, target: 1200},
] as const;

const DAYS = 14;

/** Small deterministic generator so the dataset is identical on every run. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** `data` objects ready to POST to Lattice, oldest first. `today` anchors the 14-day window (UTC). */
export function generateDemoData(today: Date = new Date()): Record<string, string | number>[] {
  const rand = lcg(2026);
  const out: Record<string, string | number>[] = [];
  for (let back = DAYS - 1; back >= 0; back--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    const weekend = [0, 6].includes(day.getUTCDay());
    for (const [i, ch] of CHANNELS.entries()) {
      const growth = 1 + (DAYS - back) * 0.012;
      const value = Math.round(ch.base * growth * (weekend ? 0.7 : 1) * (0.9 + rand() * 0.2));
      const r: Record<string, string | number> = {
        name: `${ch.category} page views`,
        value,
        recorded_at: isoDay(day),
        category: ch.category,
        unit: 'views',
      };
      // Older days are completed; Social is paused for a stretch; the most recent days are active.
      r.status = back > 9 ? 'completed' : ch.category === 'Social' && back > 4 ? 'paused' : 'active';
      r.target = ch.target;
      // Imperfections, spread out so they are findable but not dominant.
      if ((back + i) % 6 === 0) delete r.target;
      if ((back * 3 + i) % 11 === 0) delete r.status;
      out.push(r);
    }
  }
  // One entry with no category, to show how "Uncategorized" is handled.
  out.push({name: 'Unattributed referral traffic', value: 380, recorded_at: isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))), unit: 'views', status: 'active'});
  return out;
}

const SHOWCASE_SERIES = [
  {category: 'Docs', values: [4200, 4350, 4600, 4480, 4800, 5050], target: 4500},
  {category: 'Blog', values: [2600, 2500, 2900, 2750, 3100, 3250], target: 3000},
  {category: 'Social', values: [900, 850, 760, 700, 1000, 1100], target: 1200},
] as const;

/**
 * A small, hand-enterable dataset (24 entries) for a live walkthrough: 3 channels over the last 6 days
 * plus a few deliberate edge cases (missing status, missing target, no category, mixed-case status).
 * Units are the same throughout so totals are shown; adding an entry with another unit hides them.
 */
export function generateShowcaseData(today: Date = new Date()): Record<string, string | number>[] {
  const day = (back: number) => isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back)));
  const out: Record<string, string | number>[] = [];
  const days = SHOWCASE_SERIES[0].values.length;
  for (const s of SHOWCASE_SERIES) {
    s.values.forEach((value, i) => {
      const back = days - 1 - i;
      // Oldest two days completed, newest active; Social is paused in the middle.
      const status = back >= 4 ? 'completed' : s.category === 'Social' && back >= 2 ? 'paused' : 'active';
      out.push({name: `${s.category} page views`, value, recorded_at: day(back), category: s.category, status, target: s.target, unit: 'views'});
    });
  }
  // Edge cases, each visible in a different part of the board.
  out.push({name: 'Docs page views', value: 4700, recorded_at: day(1), category: 'Docs', target: 4500, unit: 'views'}); // no status
  out.push({name: 'Blog page views', value: 3000, recorded_at: day(0), category: 'Blog', status: 'Active', unit: 'views'}); // no target; "Active" groups with "active"
  out.push({name: 'Unattributed referral traffic', value: 380, recorded_at: day(1), status: 'active', unit: 'views'}); // no category
  out.push({name: 'Docs page views', value: 4950, recorded_at: day(0), category: 'Docs', status: 'active', target: 4500, unit: 'views'});
  out.push({name: 'Social page views', value: 1050, recorded_at: day(0), category: 'Social', status: 'active', target: 1200, unit: 'views'});
  out.push({name: 'Blog page views', value: 3180, recorded_at: day(1), category: 'Blog', status: 'active', target: 3000, unit: 'views'});
  return out;
}
