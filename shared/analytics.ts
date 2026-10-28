import type {MetricRecord} from './types.js';

/**
 * Pure transformations from normalized records to what the dashboard draws. No I/O, no React.
 * Rules shared by every function: a record with a null value never contributes to a sum, average
 * or chart point; a record is never given a timestamp, category or status it did not have.
 */

export const UNCATEGORIZED = 'Uncategorized';
export const NO_STATUS = 'No status';
export const ACTIVE_STATUS = 'active';
const MAX_SERIES = 5;

export type ValueSummary =
  | {kind: 'ok'; sum: number; average: number; count: number; unit: string | null}
  | {kind: 'unavailable'; reason: 'no_values' | 'mixed_units'};

export type ActiveSummary = {kind: 'ok'; count: number; withStatus: number} | {kind: 'unavailable'};

export interface Kpis {
  totalRecords: number;
  value: ValueSummary;
  active: ActiveSummary;
}

const numeric = (r: MetricRecord): r is MetricRecord & {value: number} => r.value !== null;

/** Distinct non-empty units among records that have a numeric value. */
function unitsOf(records: MetricRecord[]): string[] {
  return [...new Set(records.filter(numeric).flatMap((r) => (r.unit ? [r.unit] : [])))];
}

/** Summing across different units is meaningless, so more than one unit makes the sum unavailable. */
export function summarizeValues(records: MetricRecord[]): ValueSummary {
  const withValue = records.filter(numeric);
  if (withValue.length === 0) return {kind: 'unavailable', reason: 'no_values'};
  const units = unitsOf(records);
  if (units.length > 1) return {kind: 'unavailable', reason: 'mixed_units'};
  const sum = withValue.reduce((acc, r) => acc + r.value, 0);
  return {kind: 'ok', sum, average: sum / withValue.length, count: withValue.length, unit: units[0] ?? null};
}

export function computeKpis(records: MetricRecord[]): Kpis {
  const withStatus = records.filter((r) => r.status !== null);
  return {
    totalRecords: records.length,
    value: summarizeValues(records),
    active:
      withStatus.length === 0
        ? {kind: 'unavailable'}
        : {kind: 'ok', count: withStatus.filter((r) => r.status === ACTIVE_STATUS).length, withStatus: withStatus.length},
  };
}

export interface CategoryRow {
  label: string;
  isMissing: boolean;
  count: number;
  /** Sum of numeric values; null when no record in the group has one. */
  sum: number | null;
}

/** Groups by category. Sorted by `sum` (or `count` when `by` is 'count'), descending, then label. */
export function groupByCategory(records: MetricRecord[], by: 'sum' | 'count'): CategoryRow[] {
  const groups = new Map<string, CategoryRow>();
  for (const r of records) {
    const label = r.category ?? UNCATEGORIZED;
    const row = groups.get(label) ?? {label, isMissing: r.category === null, count: 0, sum: null};
    row.count += 1;
    if (r.value !== null) row.sum = (row.sum ?? 0) + r.value;
    groups.set(label, row);
  }
  const metric = (row: CategoryRow) => (by === 'sum' ? (row.sum ?? 0) : row.count);
  return [...groups.values()].sort((a, b) => metric(b) - metric(a) || a.label.localeCompare(b.label));
}

export interface StatusRow {
  status: string;
  isMissing: boolean;
  count: number;
}

/** Counts per status found in the data (nothing is assumed), most frequent first. Null if no record has a status. */
export function groupByStatus(records: MetricRecord[]): StatusRow[] | null {
  if (!records.some((r) => r.status !== null)) return null;
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.status ?? NO_STATUS, (counts.get(r.status ?? NO_STATUS) ?? 0) + 1);
  return [...counts.entries()]
    .map(([status, count]) => ({status, count, isMissing: status === NO_STATUS}))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export interface SeriesPoint {
  day: string; // YYYY-MM-DD, UTC
  value: number;
}
export interface Series {
  label: string;
  points: SeriesPoint[]; // ascending by day; only days that have data
}
export type TimeSeries =
  | {kind: 'ok'; days: string[]; series: Series[]; total: Series; excluded: number; collapsedCategories: number}
  | {kind: 'insufficient'; reason: 'no_dated_values' | 'single_day' | 'mixed_units'; excluded: number};

/**
 * Daily sums of `value`, one line per category (top MAX_SERIES by total, the rest merged into "Other"),
 * plus an overall line. Only records with both a timestamp and a numeric value are plotted; the rest
 * are counted in `excluded`. Days without data get no point (nothing is interpolated or zero-filled).
 */
export function buildTimeSeries(records: MetricRecord[]): TimeSeries {
  const plotted = records.filter(numeric).filter((r) => r.recordedAt !== null);
  const excluded = records.length - plotted.length;
  if (plotted.length === 0) return {kind: 'insufficient', reason: 'no_dated_values', excluded};
  if (unitsOf(plotted).length > 1) return {kind: 'insufficient', reason: 'mixed_units', excluded};

  const dayOf = (r: MetricRecord) => (r.recordedAt as string).slice(0, 10);
  const days = [...new Set(plotted.map(dayOf))].sort();
  if (days.length < 2) return {kind: 'insufficient', reason: 'single_day', excluded};

  const totals = new Map<string, number>();
  for (const r of plotted) totals.set(r.category ?? UNCATEGORIZED, (totals.get(r.category ?? UNCATEGORIZED) ?? 0) + r.value);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  const kept = new Set(ranked.slice(0, MAX_SERIES));
  const collapsedCategories = Math.max(0, ranked.length - MAX_SERIES);
  const labelOf = (r: MetricRecord) => {
    const c = r.category ?? UNCATEGORIZED;
    return kept.has(c) ? c : 'Other';
  };

  const byLabel = new Map<string, Map<string, number>>();
  const overall = new Map<string, number>();
  for (const r of plotted) {
    const day = dayOf(r);
    const m = byLabel.get(labelOf(r)) ?? new Map<string, number>();
    m.set(day, (m.get(day) ?? 0) + r.value);
    byLabel.set(labelOf(r), m);
    overall.set(day, (overall.get(day) ?? 0) + r.value);
  }
  const toSeries = (label: string, m: Map<string, number>): Series => ({
    label,
    points: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({day, value})),
  });
  const order = collapsedCategories > 0 ? [...ranked.slice(0, MAX_SERIES), 'Other'] : ranked;
  return {
    kind: 'ok',
    days,
    series: order.map((l) => toSeries(l, byLabel.get(l) as Map<string, number>)),
    total: toSeries('All categories', overall),
    excluded,
    collapsedCategories,
  };
}

/** Newest first by timestamp; records without a timestamp come last (higher id first within ties). */
export function sortRecent(records: MetricRecord[], limit = 10): MetricRecord[] {
  const time = (r: MetricRecord) => (r.recordedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(r.recordedAt));
  return [...records]
    .sort((a, b) => {
      const ta = time(a);
      const tb = time(b);
      if (ta !== tb) return ta === Number.NEGATIVE_INFINITY ? 1 : tb === Number.NEGATIVE_INFINITY ? -1 : tb - ta;
      return Number(b.id) - Number(a.id) || b.id.localeCompare(a.id);
    })
    .slice(0, limit);
}

/** Fallback panel when no status exists: the records with the largest values. */
export function topByValue(records: MetricRecord[], limit = 5): MetricRecord[] {
  return records
    .filter(numeric)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, limit);
}
