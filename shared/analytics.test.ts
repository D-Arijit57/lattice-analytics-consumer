import {describe, expect, it} from 'vitest';
import {
  buildTimeSeries,
  computeKpis,
  groupByCategory,
  groupByStatus,
  NO_STATUS,
  sortRecent,
  summarizeValues,
  topByValue,
  UNCATEGORIZED,
} from './analytics.ts';
import type {MetricRecord} from './types.ts';

let n = 0;
const rec = (o: Partial<MetricRecord> = {}): MetricRecord => ({
  id: String(++n), name: 'r', category: null, value: null, recordedAt: null, status: null, target: null, unit: null, ...o,
});

describe('KPIs', () => {
  it('handles an empty dataset', () => {
    expect(computeKpis([])).toEqual({totalRecords: 0, value: {kind: 'unavailable', reason: 'no_values'}, active: {kind: 'unavailable'}});
  });

  it('sums and averages only numeric values (invalid ones are null)', () => {
    const k = computeKpis([rec({value: 10}), rec({value: 20}), rec({value: null}), rec({value: 0})]);
    expect(k.totalRecords).toBe(4);
    expect(k.value).toEqual({kind: 'ok', sum: 30, average: 10, count: 3, unit: null});
  });

  it('refuses to add values with different units', () => {
    expect(summarizeValues([rec({value: 1, unit: 'views'}), rec({value: 2, unit: 'USD'})])).toEqual({kind: 'unavailable', reason: 'mixed_units'});
  });

  it('ignores the unit of records without a value when judging units', () => {
    const v = summarizeValues([rec({value: 1, unit: 'views'}), rec({value: null, unit: 'USD'})]);
    expect(v).toMatchObject({kind: 'ok', unit: 'views'});
  });

  it('counts active records case-insensitively via normalized status, relative to records with a status', () => {
    const k = computeKpis([rec({status: 'active'}), rec({status: 'paused'}), rec({status: null})]);
    expect(k.active).toEqual({kind: 'ok', count: 1, withStatus: 2});
  });

  it('reports active as unavailable when no record has a status', () => {
    expect(computeKpis([rec(), rec()]).active).toEqual({kind: 'unavailable'});
  });
});

describe('groupByCategory', () => {
  const rows = [
    rec({category: 'B', value: 5}), rec({category: 'A', value: 5}), rec({category: 'A', value: 1}),
    rec({category: null, value: 100}), rec({category: 'C', value: null}),
  ];
  it('aggregates sums, missing categories and null-only groups', () => {
    const out = groupByCategory(rows, 'sum');
    expect(out.map((r) => [r.label, r.sum, r.count])).toEqual([[UNCATEGORIZED, 100, 1], ['A', 6, 2], ['B', 5, 1], ['C', null, 1]]);
    expect(out[0].isMissing).toBe(true);
  });
  it('can rank by count, with label as the tie-break', () => {
    expect(groupByCategory(rows, 'count').map((r) => r.label)).toEqual(['A', 'B', 'C', UNCATEGORIZED]);
  });
  it('returns nothing for no records', () => expect(groupByCategory([], 'sum')).toEqual([]));
});

describe('groupByStatus', () => {
  it('derives statuses from the data, including unexpected ones and missing', () => {
    const out = groupByStatus([rec({status: 'active'}), rec({status: 'active'}), rec({status: 'on-fire'}), rec()]);
    expect(out?.map((r) => [r.status, r.count])).toEqual([['active', 2], [NO_STATUS, 1], ['on-fire', 1]]);
  });
  it('returns null when no record has a status', () => expect(groupByStatus([rec(), rec()])).toBeNull());
});

describe('buildTimeSeries', () => {
  it('is insufficient without dated numeric values and counts what it excluded', () => {
    expect(buildTimeSeries([rec({value: 1}), rec({recordedAt: '2026-10-01'})])).toEqual({kind: 'insufficient', reason: 'no_dated_values', excluded: 2});
    expect(buildTimeSeries([])).toMatchObject({kind: 'insufficient', reason: 'no_dated_values'});
  });
  it('needs at least two distinct days', () => {
    const r = buildTimeSeries([rec({value: 1, recordedAt: '2026-10-01'}), rec({value: 2, recordedAt: '2026-10-01'})]);
    expect(r).toMatchObject({kind: 'insufficient', reason: 'single_day'});
  });
  it('is insufficient across mixed units', () => {
    const r = buildTimeSeries([rec({value: 1, unit: 'a', recordedAt: '2026-10-01'}), rec({value: 1, unit: 'b', recordedAt: '2026-10-02'})]);
    expect(r).toMatchObject({kind: 'insufficient', reason: 'mixed_units'});
  });
  it('sorts chronologically regardless of input order and sums per day and category', () => {
    const r = buildTimeSeries([
      rec({value: 5, category: 'A', recordedAt: '2026-10-03'}),
      rec({value: 1, category: 'A', recordedAt: '2026-10-01'}),
      rec({value: 2, category: 'A', recordedAt: '2026-10-01'}),
      rec({value: 7, category: 'B', recordedAt: '2026-10-02T23:30:00.000Z'}),
      rec({value: 9, recordedAt: null}),
    ]);
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(r.excluded).toBe(1);
    expect(r.series.find((s) => s.label === 'A')?.points).toEqual([{day: '2026-10-01', value: 3}, {day: '2026-10-03', value: 5}]);
    expect(r.total.points.map((p) => p.value)).toEqual([3, 7, 5]);
  });
  it('collapses categories beyond the top five into Other', () => {
    const recs = 'ABCDEFG'.split('').flatMap((c, i) => [
      rec({value: 100 - i, category: c, recordedAt: '2026-10-01'}),
      rec({value: 100 - i, category: c, recordedAt: '2026-10-02'}),
    ]);
    const r = buildTimeSeries(recs);
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.series.map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'Other']);
    expect(r.collapsedCategories).toBe(2);
    expect(r.series[5].points[0].value).toBe(95 + 94);
  });
});

describe('sortRecent', () => {
  it('orders newest first, undated last, and respects the limit without mutating input', () => {
    const input = [
      rec({id: '1', recordedAt: '2026-10-01'}), rec({id: '2', recordedAt: null}),
      rec({id: '3', recordedAt: '2026-10-03'}), rec({id: '4', recordedAt: '2026-10-02T12:00:00.000Z'}),
    ];
    const copy = [...input];
    expect(sortRecent(input, 3).map((r) => r.id)).toEqual(['3', '4', '1']);
    expect(sortRecent(input).map((r) => r.id)).toEqual(['3', '4', '1', '2']);
    expect(input).toEqual(copy);
  });
  it('breaks ties by higher id', () => {
    expect(sortRecent([rec({id: '5', recordedAt: '2026-10-01'}), rec({id: '9', recordedAt: '2026-10-01'})]).map((r) => r.id)).toEqual(['9', '5']);
  });
});

describe('topByValue', () => {
  it('skips null values', () => {
    expect(topByValue([rec({id: '1', value: 3}), rec({id: '2', value: null}), rec({id: '3', value: 9})], 5).map((r) => r.id)).toEqual(['3', '1']);
  });
});
