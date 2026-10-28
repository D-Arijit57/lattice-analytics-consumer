import {describe, expect, it} from 'vitest';
import {loadConfig} from './config.ts';
import {createRecordsService} from './service.ts';
import {cfg as _cfg, entry, jsonRes, stubFetch} from './test-utils.ts';

const live = loadConfig({LATTICE_API_BASE_URL: 'http://lattice.test/api', LATTICE_API_KEY: 'lat_k'});
const ok = () => jsonRes({next: null, results: [entry(1), entry(2)]});

describe('records service', () => {
  it('returns live records labelled as coming from Lattice', async () => {
    const svc = createRecordsService(live, stubFetch(ok()).impl);
    const r = await svc();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({source: {kind: 'lattice', slug: 'metric-record'}, refreshIntervalMs: 60_000});
  });

  it('caches within the TTL, shares concurrent fetches, and lets a fresh request bypass after the cooldown', async () => {
    let t = 1_000_000;
    const {impl, calls} = stubFetch(ok());
    const svc = createRecordsService(live, impl, () => t);
    await Promise.all([svc(), svc(), svc()]);
    expect(calls).toHaveLength(1);
    await svc();
    expect(calls).toHaveLength(1);
    t += 6_000;
    await svc({fresh: true});
    expect(calls).toHaveLength(2);
    await svc({fresh: true}); // within 5 s cooldown: served from cache
    expect(calls).toHaveLength(2);
  });

  it('never substitutes demo data when Lattice fails, and does not cache the failure', async () => {
    const {impl, calls} = stubFetch(jsonRes({detail: 'no'}, 401), ok());
    const svc = createRecordsService(live, impl, () => 5_000_000);
    const bad = await svc();
    expect(bad.status).toBe(502);
    expect(bad.body).toMatchObject({error: {code: 'unauthorized'}});
    expect(JSON.stringify(bad.body)).not.toContain('records');
    const good = await svc();
    expect(good.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('serves a clearly labelled fixture only when demo mode is enabled, without any network call', async () => {
    const {impl, calls} = stubFetch(new Error('should not be called'));
    const svc = createRecordsService(loadConfig({ANALYTICS_DEMO_MODE: 'true'}), impl);
    const r = await svc();
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(0);
    const body = r.body as {source: {kind: string}; records: unknown[]};
    expect(body.source.kind).toBe('demo');
    expect(body.records.length).toBeGreaterThan(50);
  });
});
void _cfg;
