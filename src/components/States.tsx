import {isConfigError, type ApiError} from '../lib/api.ts';

export function LoadingState() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading records">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-4 h-8 w-28" />
            <div className="skeleton mt-3 h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2"><div className="skeleton h-72 w-full" /></div>
        <div className="card p-5"><div className="skeleton h-72 w-full" /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5"><div className="skeleton h-56 w-full" /></div>
        <div className="card p-5 lg:col-span-2"><div className="skeleton h-56 w-full" /></div>
      </div>
      <p className="text-center text-sm text-[var(--muted)]">Loading records from Lattice…</p>
    </div>
  );
}

export function EmptyState({contentType, demo}: {contentType: string; demo: boolean}) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center" role="status">
      <h2 className="text-lg font-semibold">No records yet</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {demo ? 'The demo fixture is empty.' : <>The request succeeded, but the “{contentType}” content type has no entries for this API key.</>}
      </p>
      {!demo && (
        <p className="mt-4 text-sm">
          Add entries in Lattice (or run <code className="num rounded bg-[#f0f0ec] px-1.5 py-0.5">npm run seed</code> against a local instance), then refresh.
        </p>
      )}
    </div>
  );
}

export function ErrorState({error, onRetry, busy}: {error: ApiError; onRetry: () => void; busy: boolean}) {
  const config = isConfigError(error);
  return (
    <div className="card mx-auto max-w-xl border-red-200 p-8 text-center" role="alert">
      <h2 className="text-lg font-semibold">{config ? 'Configuration problem' : 'Could not load records'}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{error.message}</p>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {config
          ? 'Check LATTICE_API_BASE_URL, LATTICE_API_KEY and LATTICE_METRIC_CONTENT_TYPE on the server. Retrying will not help until they are fixed.'
          : 'This is usually temporary. No previous data is available to show.'}
      </p>
      <button className="btn mt-5" onClick={onRetry} disabled={busy}>
        {busy ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
