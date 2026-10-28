import {isStale, type RefreshState} from '../lib/refresh.ts';
import {formatClock} from '../lib/format.ts';

type Tone = 'ok' | 'warn' | 'bad' | 'idle' | 'demo';
const dot: Record<Tone, string> = {ok: '#059669', warn: '#d97706', bad: '#dc2626', idle: '#9ca3af', demo: '#d97706'};

export function connectionStatus(state: RefreshState, now: number): {tone: Tone; label: string} {
  if (state.phase === 'loading') return {tone: 'idle', label: 'Connecting…'};
  if (state.error) return {tone: 'bad', label: state.data ? 'Refresh failed' : 'Not connected'};
  if (state.data?.source.kind === 'demo') return {tone: 'demo', label: 'Demo data'};
  if (isStale(state, now, state.data?.refreshIntervalMs ?? 60_000)) return {tone: 'warn', label: 'May be stale'};
  return {tone: 'ok', label: 'Connected to Lattice'};
}

export function Header({state, now, onRefresh}: {state: RefreshState; now: number; onRefresh: () => void}) {
  const status = connectionStatus(state, now);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lattice Analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Insights from structured content</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-2" role="status">
          <i className="inline-block size-2 rounded-full" style={{background: dot[status.tone]}} />
          {status.label}
        </span>
        <span className="text-[var(--muted)]">
          {state.lastSuccessAt ? (
            <>Last updated <span className="num">{formatClock(state.lastSuccessAt)}</span></>
          ) : (
            'Not yet updated'
          )}
        </span>
        <button className="btn" onClick={onRefresh} disabled={state.refreshing} aria-label="Refresh data">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={state.refreshing ? 'spin' : ''} aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
          </svg>
          {state.refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}
