import {describe, expect, it, vi} from 'vitest';
import {createApiHandler} from './handler.ts';
import {entry, jsonRes, stubFetch} from './test-utils.ts';

const env = {LATTICE_API_BASE_URL: 'http://lattice.test/api', LATTICE_API_KEY: 'lat_handler-secret'};
const get = (path: string, method = 'GET') => new Request(`http://app.test${path}`, {method});

describe('API handler', () => {
  it('serves /api/records as JSON with no-store', async () => {
    const h = createApiHandler(env, stubFetch(jsonRes({next: null, results: [entry(1)]})).impl);
    const res = await h(get('/api/records'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).records).toHaveLength(1);
  });

  it('never includes the API key in a response', async () => {
    const h = createApiHandler(env, stubFetch(jsonRes({next: null, results: [entry(1)]})).impl);
    expect(await (await h(get('/api/records'))).text()).not.toContain('lat_handler-secret');
  });

  it('only exposes GET /api/records', async () => {
    const h = createApiHandler(env, stubFetch(jsonRes({results: []})).impl);
    expect((await h(get('/api/other'))).status).toBe(404);
    expect((await h(get('/api/records', 'POST'))).status).toBe(405);
    // a client cannot choose the upstream content type or URL
    const { impl, calls } = stubFetch(jsonRes({next: null, results: []}));
    await createApiHandler(env, impl)(get('/api/records?type=secret&url=http://evil.test'));
    expect(calls[0].url.pathname).toBe('/api/delivery/content-types/metric-record/entries/');
  });

  it('returns a generic 500 for bad configuration and logs only variable names', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = createApiHandler({LATTICE_API_BASE_URL: 'nope', LATTICE_API_KEY: 'sk_leaky_value'});
    const res = await h(get('/api/records'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('misconfigured');
    expect(text).not.toContain('sk_leaky_value');
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('sk_leaky_value');
    spy.mockRestore();
  });
});
