/** Categorical series colours (distinguishable in light mode, restrained). "Other" is always neutral grey. */
export const SERIES_COLORS = ['#2563eb', '#0d9488', '#d97706', '#9333ea', '#db2777'];
export const OTHER_COLOR = '#94a3b8';

export function seriesColor(index: number, label: string): string {
  return label === 'Other' ? OTHER_COLOR : SERIES_COLORS[index % SERIES_COLORS.length];
}

const STATUS_COLORS: Record<string, string> = {active: '#059669', paused: '#d97706', completed: '#64748b', pending: '#2563eb'};
const STATUS_FALLBACK = ['#9333ea', '#db2777', '#0d9488', '#ca8a04'];

export function statusColor(status: string, isMissing: boolean, index: number): string {
  if (isMissing) return '#cbd5e1';
  return STATUS_COLORS[status] ?? STATUS_FALLBACK[index % STATUS_FALLBACK.length];
}
