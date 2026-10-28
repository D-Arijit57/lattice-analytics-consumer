import type {IssueCode, MetricRecord, SkippedEntry} from './types.js';

/** Which Lattice field plays each role. Override with LATTICE_FIELD_MAP. */
export interface FieldMap {
  name: string;
  category: string;
  value: string;
  recordedAt: string;
  status: string;
  target: string;
  unit: string;
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  name: 'name',
  category: 'category',
  value: 'value',
  recordedAt: 'recorded_at',
  status: 'status',
  target: 'target',
  unit: 'unit',
};

export type NormalizeResult =
  | {ok: true; record: MetricRecord; issues: IssueCode[]}
  | ({ok: false} & SkippedEntry);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// An ISO date-time must carry an explicit offset; without one the instant is ambiguous.
const DATE_TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Finite numbers only. Numeric strings are rejected: Lattice's `number` type never produces them. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Parses a timestamp without guessing. Returns `YYYY-MM-DD` for a real calendar day, a UTC ISO instant
 * for a date-time with an explicit offset, and null otherwise (including offset-less date-times and
 * impossible dates such as Feb 31).
 */
export function parseTimestamp(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const day = DATE_ONLY.exec(s);
  if (day) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
  }
  if (!DATE_TIME_WITH_OFFSET.test(s)) return null;
  const iso = s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Turns one Lattice delivery entry (`{id, data, ...}`) into a MetricRecord. Only an unreadable entry
 * is rejected; a bad or missing field becomes null plus an issue code, so one malformed value never
 * removes a record from the board or breaks a chart.
 */
export function normalizeEntry(raw: unknown, map: FieldMap = DEFAULT_FIELD_MAP): NormalizeResult {
  if (typeof raw !== 'object' || raw === null) return {ok: false, id: '?', reason: 'Entry is not an object.'};
  const entry = raw as {id?: unknown; data?: unknown};
  const id = typeof entry.id === 'number' || typeof entry.id === 'string' ? String(entry.id) : null;
  if (id === null) return {ok: false, id: '?', reason: 'Entry has no id.'};
  if (typeof entry.data !== 'object' || entry.data === null || Array.isArray(entry.data)) {
    return {ok: false, id, reason: 'Entry data is not an object.'};
  }
  const data = entry.data as Record<string, unknown>;
  const issues: IssueCode[] = [];
  const present = (key: string) => data[key] !== undefined && data[key] !== null && data[key] !== '';

  const name = text(data[map.name]);
  if (!name) issues.push('missing_name');

  const value = num(data[map.value]);
  if (value === null) issues.push(present(map.value) ? 'invalid_value' : 'missing_value');

  const recordedAt = parseTimestamp(data[map.recordedAt]);
  if (recordedAt === null) issues.push(present(map.recordedAt) ? 'invalid_timestamp' : 'missing_timestamp');

  const target = num(data[map.target]);
  if (target === null && present(map.target)) issues.push('invalid_target');

  return {
    ok: true,
    issues,
    record: {
      id,
      name,
      category: text(data[map.category]),
      value,
      recordedAt,
      status: text(data[map.status])?.toLowerCase() ?? null,
      target,
      unit: text(data[map.unit]),
    },
  };
}
