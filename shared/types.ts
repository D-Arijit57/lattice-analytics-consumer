/** A Lattice entry reduced to what the board needs. Every optional field may be null. */
export interface MetricRecord {
  id: string;
  name: string | null;
  category: string | null;
  /** Null when absent or not a finite number; such records are excluded from numeric calculations. */
  value: number | null;
  /** `YYYY-MM-DD` (a calendar day, read as UTC) or a full ISO instant in UTC. Null when absent or invalid. */
  recordedAt: string | null;
  /** Trimmed and lower-cased so "Active" and "active" group together. */
  status: string | null;
  target: number | null;
  unit: string | null;
}

export type IssueCode =
  | 'missing_name'
  | 'missing_value'
  | 'invalid_value'
  | 'missing_timestamp'
  | 'invalid_timestamp'
  | 'invalid_target';

export type IssueCounts = Partial<Record<IssueCode, number>>;

export interface SkippedEntry {
  id: string;
  reason: string;
}

export interface RecordsResponse {
  records: MetricRecord[];
  /** Entries that could not be read at all (not an object, no id). */
  skipped: SkippedEntry[];
  /** How many loaded records have a problem in an optional or numeric field; they still render. */
  issues: IssueCounts;
  /** True when more than MAX_PAGES of entries exist and only the newest were loaded. */
  truncated: boolean;
  fetchedAt: string;
  source: {
    /** `lattice` = live Delivery API. `demo` = built-in fixture, only when the server is started in demo mode. */
    kind: 'lattice' | 'demo';
    contentType: string;
    slug: string;
  };
  /** Client polling interval chosen by the server's configuration. */
  refreshIntervalMs: number;
}

export type ApiErrorCode =
  | 'misconfigured'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'upstream'
  | 'unreachable'
  | 'bad_request';

export interface ApiErrorBody {
  error: {code: ApiErrorCode; message: string};
}
