import type {ApiError} from '../lib/api.ts';
import type {IssueCode, RecordsResponse} from '../../shared/types.ts';

const issueText: Record<IssueCode, string> = {
  missing_name: 'no name',
  missing_value: 'no value',
  invalid_value: 'a non-numeric value',
  missing_timestamp: 'no date',
  invalid_timestamp: 'an unreadable or ambiguous date (date-times need a UTC offset)',
  invalid_target: 'a non-numeric target',
};

function Banner({tone, children}: {tone: 'amber' | 'red' | 'slate'; children: React.ReactNode}) {
  const cls = {amber: 'border-amber-300 bg-amber-50 text-amber-900', red: 'border-red-300 bg-red-50 text-red-900', slate: 'border-[var(--border)] bg-white text-[var(--muted)]'}[tone];
  return <div className={`rounded-lg border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}

export function Notices({data, error, stale}: {data: RecordsResponse | null; error: ApiError | null; stale: boolean}) {
  const issues = data ? (Object.entries(data.issues) as [IssueCode, number][]).filter(([, n]) => n > 0) : [];
  return (
    <div className="space-y-2 empty:hidden">
      {data?.source.kind === 'demo' && (
        <Banner tone="amber" >
          <strong>Demo data.</strong> These records come from a built-in fixture (ANALYTICS_DEMO_MODE), not from Lattice.
        </Banner>
      )}
      {error && data && (
        <Banner tone="red">
          <strong>Could not refresh.</strong> {error.message} Showing the data from the last successful load; it will be retried automatically.
        </Banner>
      )}
      {!error && stale && <Banner tone="amber">This data has not been refreshed recently and may be out of date.</Banner>}
      {data?.truncated && <Banner tone="slate">More entries exist than were loaded; only the newest {data.records.length} are included.</Banner>}
      {(issues.length > 0 || (data?.skipped.length ?? 0) > 0) && (
        <Banner tone="slate">
          <strong className="font-medium text-[var(--text)]">Data quality.</strong>{' '}
          {issues.map(([code, n]) => `${n} record${n === 1 ? ' has' : 's have'} ${issueText[code]}`).join('; ')}
          {issues.length > 0 && '. '}
          {issues.length > 0 && 'These are left out of the calculations that need them. '}
          {(data?.skipped.length ?? 0) > 0 && `${data?.skipped.length} entr${data?.skipped.length === 1 ? 'y was' : 'ies were'} unreadable and skipped.`}
        </Banner>
      )}
    </div>
  );
}
