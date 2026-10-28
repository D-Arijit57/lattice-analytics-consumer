import type {LatticeConfig} from './config.ts';
import {DEFAULT_FIELD_MAP} from '../shared/normalize.ts';

export const cfg: LatticeConfig = {
  baseUrl: 'http://lattice.test/api',
  apiKey: 'lat_secret-test-key',
  contentTypeSlug: 'metric-record',
  fieldMap: DEFAULT_FIELD_MAP,
};

export const entry = (id: number, data: Record<string, unknown> = {name: `n${id}`, value: id, recorded_at: '2026-10-01'}) => ({
  id, content_type_version_id: 1, version_number: 1, data, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
});

/** A fetch stub returning the given responses in order and recording every request. */
export function stubFetch(...responses: (Response | Error)[]) {
  const calls: {url: URL; headers: Headers}[] = [];
  const impl = (async (input: URL | string, init?: RequestInit) => {
    calls.push({url: new URL(String(input)), headers: new Headers(init?.headers)});
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  }) as typeof fetch;
  return {impl, calls};
}

export const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
