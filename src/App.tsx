import {useEffect, useState} from 'react';
import {Board} from './components/Dashboard.tsx';
import {Header} from './components/Header.tsx';
import {Notices} from './components/Notices.tsx';
import {EmptyState, ErrorState, LoadingState} from './components/States.tsx';
import {isStale, type RefreshState} from './lib/refresh.ts';
import {useRecords} from './lib/useRecords.ts';

/** Presentational shell, separate from the data hook so every state can be rendered in tests. */
export function AnalyticsView({state, now, onRefresh}: {state: RefreshState; now: number; onRefresh: () => void}) {
  const {data, error} = state;
  const stale = isStale(state, now, data?.refreshIntervalMs ?? 60_000);
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Header state={state} now={now} onRefresh={onRefresh} />
      <Notices data={data} error={error} stale={stale} />
      <main>
        {state.phase === 'loading' && <LoadingState />}
        {state.phase === 'error' && error && <ErrorState error={error} onRetry={onRefresh} busy={state.refreshing} />}
        {data && data.records.length === 0 && <EmptyState contentType={data.source.contentType} demo={data.source.kind === 'demo'} />}
        {data && data.records.length > 0 && <Board data={data} />}
      </main>
    </div>
  );
}

export default function App() {
  const {state, refresh} = useRecords();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000); // re-evaluate staleness
    return () => clearInterval(t);
  }, []);
  return <AnalyticsView state={state} now={now} onRefresh={() => void refresh(true)} />;
}
