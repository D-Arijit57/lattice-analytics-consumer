import type {RecordsResponse} from '../../shared/types.ts';
import {ApiError} from './api.ts';

export interface RefreshState {
  /** `loading` only until the first attempt finishes; afterwards `ready` or `error` (error = never loaded anything). */
  phase: 'loading' | 'ready' | 'error';
  /** Last successfully loaded dataset. Kept when a later refresh fails. */
  data: RecordsResponse | null;
  lastSuccessAt: number | null;
  /** A request is in flight. */
  refreshing: boolean;
  /** Error from the most recent attempt; cleared by the next success. */
  error: ApiError | null;
}

export const initialState: RefreshState = {phase: 'loading', data: null, lastSuccessAt: null, refreshing: false, error: null};

export const DEFAULT_INTERVAL_MS = 60_000;

/** Data is stale when the latest attempt failed, or nothing has succeeded for 2.5 polling intervals. */
export function isStale(state: RefreshState, now: number, intervalMs: number): boolean {
  if (state.data === null || state.lastSuccessAt === null) return false;
  return state.error !== null || now - state.lastSuccessAt > intervalMs * 2.5;
}

interface Options {
  load: (signal: AbortSignal, fresh: boolean) => Promise<RecordsResponse>;
  onChange: (state: RefreshState) => void;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/**
 * Framework-free loader: at most one request at a time, periodic polling on a self-scheduling timer
 * (so slow responses never stack), the last good dataset survives failures, and `stop()` cancels the
 * timer and the request and makes any late response a no-op.
 */
export function createRefreshController({load, onChange, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout}: Options) {
  let state = initialState;
  let inflight: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const set = (patch: Partial<RefreshState>) => {
    state = {...state, ...patch};
    onChange(state);
  };

  const schedule = () => {
    if (stopped) return;
    const ms = state.data?.refreshIntervalMs ?? DEFAULT_INTERVAL_MS;
    timer = setTimer(() => void refresh(), ms);
  };

  async function refresh(fresh = false): Promise<void> {
    if (stopped || inflight) return; // never overlap requests
    if (timer) clearTimer(timer);
    timer = null;
    const ctrl = new AbortController();
    inflight = ctrl;
    set({refreshing: true});
    try {
      const data = await load(ctrl.signal, fresh);
      if (stopped || inflight !== ctrl) return;
      set({phase: 'ready', data, lastSuccessAt: now(), refreshing: false, error: null});
    } catch (err) {
      if (stopped || inflight !== ctrl) return;
      const error = err instanceof ApiError ? err : new ApiError('network', 'Could not reach the Analytics server.');
      set({phase: state.data ? 'ready' : 'error', refreshing: false, error});
    } finally {
      if (inflight === ctrl) inflight = null;
      schedule();
    }
  }

  return {
    start() {
      stopped = false;
      void refresh();
    },
    refresh: (fresh = true) => refresh(fresh),
    stop() {
      stopped = true;
      inflight?.abort();
      inflight = null;
      if (timer) clearTimer(timer);
      timer = null;
    },
    getState: () => state,
  };
}
