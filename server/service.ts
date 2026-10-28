import {DEMO_CONTENT_TYPE, generateDemoData} from '../shared/demo-data.ts';
import {normalizeEntry} from '../shared/normalize.ts';
import type {ApiErrorBody, IssueCounts, RecordsResponse} from '../shared/types.ts';
import type {AppConfig} from './config.ts';
import {fetchRecords, LatticeError, type FetchedRecords} from './lattice.ts';

export type ServiceResult = {status: number; body: RecordsResponse | ApiErrorBody};

/** A manual refresh may bypass the cache, but never more than once per this many ms. */
const FRESH_COOLDOWN_MS = 5_000;

function demoRecords(): FetchedRecords {
  const records: FetchedRecords['records'] = [];
  const issues: IssueCounts = {};
  generateDemoData().forEach((data, i) => {
    const r = normalizeEntry({id: i + 1, data});
    if (r.ok) {
      records.push(r.record);
      for (const code of r.issues) issues[code] = (issues[code] ?? 0) + 1;
    }
  });
  return {records, skipped: [], issues, truncated: false};
}

/**
 * Serves normalized records. Responses are cached for `cacheTtlMs`, and concurrent callers share one
 * upstream fetch. A failed fetch is never cached and never replaced with fixture data: demo mode
 * is chosen at startup by ANALYTICS_DEMO_MODE, not as a reaction to an error.
 */
export function createRecordsService(cfg: AppConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let cached: {at: number; body: RecordsResponse} | null = null;
  let inflight: Promise<ServiceResult> | null = null;
  let lastFresh = 0;

  async function load(): Promise<ServiceResult> {
    try {
      const data = cfg.demo || !cfg.lattice ? demoRecords() : await fetchRecords(cfg.lattice, fetchImpl);
      const body: RecordsResponse = {
        ...data,
        fetchedAt: new Date(now()).toISOString(),
        source: cfg.demo || !cfg.lattice
          ? {kind: 'demo', contentType: DEMO_CONTENT_TYPE.name, slug: DEMO_CONTENT_TYPE.slug}
          : {kind: 'lattice', contentType: cfg.lattice.contentTypeSlug, slug: cfg.lattice.contentTypeSlug},
        refreshIntervalMs: cfg.refreshIntervalMs,
      };
      cached = {at: now(), body};
      return {status: 200, body};
    } catch (err) {
      if (err instanceof LatticeError) return {status: err.status, body: {error: {code: err.code, message: err.message}}};
      console.error('Unexpected error while loading records:', (err as Error).name);
      return {status: 500, body: {error: {code: 'upstream', message: 'Unexpected error while loading records.'}}};
    }
  }

  return async function getRecords({fresh = false}: {fresh?: boolean} = {}): Promise<ServiceResult> {
    const t = now();
    const bypass = fresh && t - lastFresh >= FRESH_COOLDOWN_MS;
    if (bypass) lastFresh = t;
    if (cached && !bypass && t - cached.at < cfg.cacheTtlMs) return {status: 200, body: cached.body};
    inflight ??= load().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
