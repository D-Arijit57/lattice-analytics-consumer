import {normalizeEntry} from '../shared/normalize.ts';
import type {ApiErrorCode, IssueCounts, MetricRecord, SkippedEntry} from '../shared/types.ts';
import type {LatticeConfig} from './config.ts';

/** Upper bound on pages per refresh: 20 x 50 = 1000 entries, well under the 60/min per-key limit. */
export const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 10_000;

export class LatticeError extends Error {
  constructor(
    public code: Exclude<ApiErrorCode, 'misconfigured' | 'bad_request'>,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

export interface FetchedRecords {
  records: MetricRecord[];
  skipped: SkippedEntry[];
  issues: IssueCounts;
  truncated: boolean;
}

/**
 * Lattice's `next` link is an absolute URL built from the request's Host header, which can be wrong
 * behind a proxy (API-Contract, Surprise 10) and is data we would be sending a bearer key to. So it is
 * never followed: only its `cursor` is taken and the URL is rebuilt from the configured base.
 */
function cursorFromNext(next: unknown): string | null {
  if (typeof next !== 'string') return null;
  try {
    return new URL(next).searchParams.get('cursor');
  } catch {
    return null;
  }
}

async function getPage(cfg: LatticeConfig, cursor: string | null, fetchImpl: FetchLike) {
  const url = new URL(`${cfg.baseUrl}/delivery/content-types/${encodeURIComponent(cfg.contentTypeSlug)}/entries/`);
  if (cursor) url.searchParams.set('cursor', cursor);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json'},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LatticeError('unreachable', 'Could not reach the Lattice API.', 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new LatticeError('unauthorized', 'Lattice rejected the API key (invalid or revoked).', 502);
  }
  if (res.status === 404) {
    throw new LatticeError('not_found', `Content type "${cfg.contentTypeSlug}" was not found for this API key.`, 502);
  }
  if (res.status === 429) throw new LatticeError('rate_limited', 'Lattice rate limit reached. Try again shortly.', 503);
  if (!res.ok) throw new LatticeError('upstream', `Lattice returned HTTP ${res.status}.`, 502);

  let page: {results?: unknown; next?: unknown};
  try {
    page = (await res.json()) as typeof page;
  } catch {
    throw new LatticeError('upstream', 'Lattice returned a non-JSON response.', 502);
  }
  if (typeof page !== 'object' || page === null || !Array.isArray(page.results)) {
    throw new LatticeError('upstream', 'Lattice returned an unexpected response shape.', 502);
  }
  return {results: page.results as unknown[], next: cursorFromNext(page.next)};
}

/** Fetches every page of the configured content type's entries and normalizes them. Duplicate ids are dropped. */
export async function fetchRecords(cfg: LatticeConfig, fetchImpl: FetchLike = fetch): Promise<FetchedRecords> {
  const records: MetricRecord[] = [];
  const skipped: SkippedEntry[] = [];
  const issues: IssueCounts = {};
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const {results, next} = await getPage(cfg, cursor, fetchImpl);
    for (const raw of results) {
      const r = normalizeEntry(raw, cfg.fieldMap);
      if (!r.ok) {
        skipped.push({id: r.id, reason: r.reason});
        continue;
      }
      if (seenIds.has(r.record.id)) continue; // cursor pagination can repeat an entry when rows are inserted mid-read
      seenIds.add(r.record.id);
      records.push(r.record);
      for (const code of r.issues) issues[code] = (issues[code] ?? 0) + 1;
    }
    if (!next || seenCursors.has(next)) break; // a repeating cursor must not loop forever
    seenCursors.add(next);
    cursor = next;
  }
  return {records, skipped, issues, truncated};
}
