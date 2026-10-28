import {describe, expect, it} from 'vitest';
import {fetchRecords, LatticeError, MAX_PAGES} from './lattice.ts';
import {cfg, entry, jsonRes, stubFetch} from './test-utils.ts';

describe('fetchRecords', () => {
  it('requests the delivery endpoint for the configured slug with a bearer key', async () => {
    const {impl, calls} = stubFetch(jsonRes({next: null, previous: null, results: [entry(1)]}));
    await fetchRecords(cfg, impl);
    expect(calls[0].url.href).toBe('http://lattice.test/api/delivery/content-types/metric-record/entries/');
    expect(calls[0].headers.get('authorization')).toBe('Bearer lat_secret-test-key');
  });

  it('follows pagination using only the cursor, never the next URL host', async () => {
    const {impl, calls} = stubFetch(
      jsonRes({next: 'http://evil.example/api/x/?cursor=abc', results: [entry(1), entry(2)]}),
      jsonRes({next: null, results: [entry(3)]}),
    );
    const r = await fetchRecords(cfg, impl);
    expect(r.records.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(calls).toHaveLength(2);
    expect(calls[1].url.origin).toBe('http://lattice.test');
    expect(calls[1].url.searchParams.get('cursor')).toBe('abc');
    expect(r.truncated).toBe(false);
  });

  it('drops duplicate ids across pages', async () => {
    const {impl} = stubFetch(jsonRes({next: 'http://x/?cursor=a', results: [entry(1), entry(2)]}), jsonRes({next: null, results: [entry(2), entry(3)]}));
    expect((await fetchRecords(cfg, impl)).records.map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('keeps going past malformed entries, counting skips and per-field issues', async () => {
    const {impl} = stubFetch(jsonRes({next: null, results: [entry(1, {name: 'a', value: 'oops'}), {id: 2, data: null}, 'junk', entry(4)]}));
    const r = await fetchRecords(cfg, impl);
    expect(r.records.map((x) => x.id)).toEqual(['1', '4']);
    expect(r.records[0].value).toBeNull();
    expect(r.skipped).toHaveLength(2);
    expect(r.issues).toMatchObject({invalid_value: 1, missing_timestamp: 1});
  });

  it('stops at MAX_PAGES and flags truncation; stops on a repeating cursor', async () => {
    let i = 0;
    const endless = (async () => jsonRes({next: `http://x/?cursor=c${i++}`, results: [entry(i)]})) as typeof fetch;
    const r = await fetchRecords(cfg, endless);
    expect(r.truncated).toBe(true);
    expect(i).toBe(MAX_PAGES);

    const loop = stubFetch(jsonRes({next: 'http://x/?cursor=same', results: [entry(1)]}));
    await fetchRecords(cfg, loop.impl);
    expect(loop.calls).toHaveLength(2);
  });

  it('returns an empty result for an empty page', async () => {
    const {impl} = stubFetch(jsonRes({next: null, results: []}));
    expect(await fetchRecords(cfg, impl)).toEqual({records: [], skipped: [], issues: {}, truncated: false});
  });

  it.each([
    [401, 'unauthorized'], [403, 'unauthorized'], [404, 'not_found'], [429, 'rate_limited'], [500, 'upstream'],
  ])('maps HTTP %i to %s without leaking the body or key', async (status, code) => {
    const {impl} = stubFetch(jsonRes({detail: 'secret internals lat_secret-test-key'}, status));
    const err = await fetchRecords(cfg, impl).catch((e) => e);
    expect(err).toBeInstanceOf(LatticeError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('lat_secret');
    expect(err.message).not.toContain('internals');
  });

  it('maps network failures, non-JSON and wrong shapes', async () => {
    expect(await fetchRecords(cfg, stubFetch(new Error('ECONNREFUSED lat_secret-test-key')).impl).catch((e) => e)).toMatchObject({code: 'unreachable'});
    expect(await fetchRecords(cfg, stubFetch(new Response('<html>', {status: 200})).impl).catch((e) => e)).toMatchObject({code: 'upstream'});
    expect(await fetchRecords(cfg, stubFetch(jsonRes({results: 'nope'})).impl).catch((e) => e)).toMatchObject({code: 'upstream'});
    const net = await fetchRecords(cfg, stubFetch(new Error('lat_secret-test-key')).impl).catch((e) => e);
    expect(net.message).not.toContain('lat_secret');
  });
});
