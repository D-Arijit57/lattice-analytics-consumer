const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const compact = new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 1});

export const formatNumber = (n: number) => number.format(n);
export const formatCompact = (n: number) => compact.format(n);

/** Days are calendar dates in UTC, so they are formatted in UTC to avoid shifting by the viewer's offset. */
const dayFmt = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
const dayLongFmt = new Intl.DateTimeFormat('en-US', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const instantFmt = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const timeFmt = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit', second: '2-digit'});

export const formatDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));
export const formatDayLong = (day: string) => dayLongFmt.format(new Date(`${day}T00:00:00Z`));

/** Date-only values show as a day; full instants show date and local time. */
export function formatRecordedAt(v: string | null): string {
  if (v === null) return '—';
  return v.length === 10 ? formatDay(v) : instantFmt.format(new Date(v));
}

export const formatClock = (ms: number) => timeFmt.format(new Date(ms));

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
