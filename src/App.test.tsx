import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {generateDemoData} from '../shared/demo-data.ts';
import {normalizeEntry} from '../shared/normalize.ts';
import type {MetricRecord, RecordsResponse} from '../shared/types.ts';
import {AnalyticsView} from './App.tsx';
import {ApiError} from './lib/api.ts';
import {initialState, type RefreshState} from './lib/refresh.ts';

const demoRecords = generateDemoData(new Date('2026-10-15T00:00:00Z')).flatMap((data, i) => {
  const r = normalizeEntry({id: i + 1, data});
  return r.ok ? [r.record] : [];
});
const response = (records: MetricRecord[], kind: 'lattice' | 'demo' = 'lattice'): RecordsResponse => ({
  records, skipped: [], issues: {}, truncated: false, fetchedAt: 'x', source: {kind, contentType: 'metric-record', slug: 'metric-record'}, refreshIntervalMs: 60_000,
});
const render = (state: RefreshState) => renderToStaticMarkup(<AnalyticsView state={state} now={1_000} onRefresh={() => {}} />);
const ready = (data: RecordsResponse, over: Partial<RefreshState> = {}): RefreshState => ({phase: 'ready', data, lastSuccessAt: 1_000, refreshing: false, error: null, ...over});

describe('AnalyticsView states', () => {
  it('shows a loading skeleton while the first request is in flight', () => {
    const html = render({...initialState, refreshing: true});
    expect(html).toContain('Loading records');
    expect(html).toContain('Connecting');
    expect(html).not.toContain('Connected to Lattice');
  });

  it('shows an empty state with a next step, and no charts, when there are no records', () => {
    const html = render(ready(response([])));
    expect(html).toContain('No records yet');
    expect(html).toContain('metric-record');
    expect(html).toContain('Add entries in Lattice');
    expect(html).not.toContain('Value over time');
  });

  it('shows a config error with retry and never a connected status', () => {
    const html = render({...initialState, phase: 'error', error: new ApiError('unauthorized', 'Lattice rejected the API key (invalid or revoked).')});
    expect(html).toContain('Configuration problem');
    expect(html).toContain('Retry');
    expect(html).toContain('Not connected');
    expect(html).not.toContain('Connected to Lattice');
  });

  it('distinguishes a transient failure from a configuration failure', () => {
    const html = render({...initialState, phase: 'error', error: new ApiError('network', 'Could not reach the Analytics server.')});
    expect(html).toContain('Could not load records');
    expect(html).not.toContain('Configuration problem');
  });

  it('keeps the previous data on screen with a failure banner after a refresh error', () => {
    const html = render(ready(response(demoRecords), {error: new ApiError('rate_limited', 'Lattice rate limit reached. Try again shortly.')}));
    expect(html).toContain('Could not refresh');
    expect(html).toContain('Refresh failed');
    expect(html).toContain('Total records');
    expect(html).not.toContain('Connected to Lattice');
  });

  it('warns about stale data and labels demo data unmistakably', () => {
    const stale = renderToStaticMarkup(<AnalyticsView state={ready(response(demoRecords), {lastSuccessAt: 0})} now={10 ** 7} onRefresh={() => {}} />);
    expect(stale).toContain('may be out of date');
    expect(render(ready(response(demoRecords, 'demo')))).toContain('not from Lattice');
  });

  it('renders KPIs and every section for a full dataset', () => {
    const html = render(ready(response(demoRecords)));
    for (const s of ['Total records', 'Total value', 'Average value', 'Active records', 'Value over time', 'Status distribution', 'By category', 'Recent records', 'Connected to Lattice', 'Last updated']) {
      expect(html).toContain(s);
    }
    expect(html).toContain('Uncategorized');
  });

  it('degrades gracefully when records have no values, dates, categories or statuses', () => {
    const bare: MetricRecord = {id: '1', name: null, category: null, value: null, recordedAt: null, status: null, target: null, unit: null};
    const html = render(ready(response([bare, {...bare, id: '2'}])));
    expect(html).toContain('No record has a numeric value');
    expect(html).toContain('nothing to plot over time');
    expect(html).toContain('Largest values');
    expect(html).toContain('Untitled');
    expect(html).not.toContain('NaN');
  });

  it('explains unavailable sums for mixed units instead of showing a meaningless total', () => {
    const a: MetricRecord = {id: '1', name: 'a', category: 'x', value: 5, recordedAt: '2026-10-01', status: 'active', target: null, unit: 'views'};
    const html = render(ready(response([a, {...a, id: '2', unit: 'USD'}])));
    expect(html).toContain('different units');
  });
});
