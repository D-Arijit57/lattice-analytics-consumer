import {describe, expect, it, vi} from 'vitest';
import type {RecordsResponse} from '../../shared/types.ts';
import {ApiError} from './api.ts';
import {createRefreshController, isStale, initialState, type RefreshState} from './refresh.ts';

const data = (n = 1, interval = 60_000): RecordsResponse => ({
  records: Array.from({length: n}, (_, i) => ({id: String(i), name: 'x', category: null, value: i, recordedAt: null, status: null, target: null, unit: null})),
  skipped: [], issues: {}, truncated: false, fetchedAt: 'x', source: {kind: 'lattice', contentType: 'c', slug: 'c'}, refreshIntervalMs: interval,
});

const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return {promise, resolve, reject};
};

function setup(load: Parameters<typeof createRefreshController>[0]['load']) {
  const states: RefreshState[] = [];
  const c = createRefreshController({load, onChange: (s) => states.push(s), now: () => 1000});
  return {c, states, last: () => states[states.length - 1]};
}

describe('refresh controller', () => {
  it('goes loading -> ready on success and records the success time', async () => {
    const {c, last} = setup(async () => data(2));
    c.start();
    await vi.waitFor(() => expect(last().phase).toBe('ready'));
    expect(last()).toMatchObject({lastSuccessAt: 1000, error: null, refreshing: false});
    expect(last().data?.records).toHaveLength(2);
    c.stop();
  });

  it('shows an error state (no data) when the very first load fails', async () => {
    const {c, last} = setup(async () => { throw new ApiError('upstream', 'boom'); });
    c.start();
    await vi.waitFor(() => expect(last().phase).toBe('error'));
    expect(last().data).toBeNull();
    expect(last().error?.message).toBe('boom');
    c.stop();
  });

  it('keeps the last successful dataset when a later refresh fails, and recovers afterwards', async () => {
    const load = vi.fn<(s: AbortSignal, f: boolean) => Promise<RecordsResponse>>()
      .mockResolvedValueOnce(data(3))
      .mockRejectedValueOnce(new ApiError('network', 'down'))
      .mockResolvedValueOnce(data(5));
    const {c, last} = setup(load);
    c.start();
    await vi.waitFor(() => expect(last().data?.records).toHaveLength(3));
    await c.refresh();
    expect(last()).toMatchObject({phase: 'ready', refreshing: false});
    expect(last().data?.records).toHaveLength(3);
    expect(last().error?.code).toBe('network');
    expect(last().lastSuccessAt).toBe(1000);
    await c.refresh();
    expect(last().data?.records).toHaveLength(5);
    expect(last().error).toBeNull();
    c.stop();
  });

  it('never overlaps requests', async () => {
    const d = deferred<RecordsResponse>();
    const load = vi.fn(() => d.promise);
    const {c, last} = setup(load);
    c.start();
    await c.refresh();
    await c.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    d.resolve(data());
    await vi.waitFor(() => expect(last().phase).toBe('ready'));
    c.stop();
  });

  it('polls on the server-provided interval', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => data(1, 15_000));
    const states: RefreshState[] = [];
    const c = createRefreshController({load, onChange: (s) => states.push(s)});
    c.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(load).toHaveBeenCalledTimes(2);
    c.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('stop() aborts the in-flight request, ignores its late result, and schedules nothing', async () => {
    const d = deferred<RecordsResponse>();
    let signal!: AbortSignal;
    const { c, states } = setup((s) => ((signal = s), d.promise));
    c.start();
    const before = states.length;
    c.stop();
    expect(signal.aborted).toBe(true);
    d.resolve(data());
    await Promise.resolve();
    await Promise.resolve();
    expect(states.length).toBe(before);
  });
});

describe('isStale', () => {
  const ready = (over: Partial<RefreshState>): RefreshState => ({...initialState, phase: 'ready', data: data(), lastSuccessAt: 0, ...over});
  it('is false before any success', () => expect(isStale(initialState, 10 ** 9, 1000)).toBe(false));
  it('is true after a failed refresh, or after 2.5 intervals without success', () => {
    expect(isStale(ready({error: new ApiError('network', 'x')}), 1, 60_000)).toBe(true);
    expect(isStale(ready({}), 149_000, 60_000)).toBe(false);
    expect(isStale(ready({}), 151_000, 60_000)).toBe(true);
  });
});
