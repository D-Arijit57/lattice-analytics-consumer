import {useMemo, useState, type KeyboardEvent, type PointerEvent} from 'react';
import type {CategoryRow, StatusRow, TimeSeries} from '../../shared/analytics.ts';
import {formatCompact, formatDay, formatDayLong, formatNumber, titleCase} from '../lib/format.ts';
import {seriesColor, statusColor} from '../lib/palette.ts';
import {dayPositions, niceTicks} from '../lib/scale.ts';

const W = 640;
const H = 260;
const M = {top: 12, right: 16, bottom: 28, left: 44};

/** Line chart of daily sums. Hover or arrow keys inspect a day; days with no data have no point. */
export function TimeSeriesChart({data, unit}: {data: Extract<TimeSeries, {kind: 'ok'}>; unit: string | null}) {
  const [active, setActive] = useState<number | null>(null);
  const pos = useMemo(() => dayPositions(data.days), [data.days]);
  const max = Math.max(...data.series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (day: string) => M.left + (pos.get(day) ?? 0) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - v / top) * (H - M.top - M.bottom);
  const xLabels = data.days.filter((_, i) => data.days.length <= 8 || i % Math.ceil(data.days.length / 7) === 0);

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    data.days.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(data.days[best]) - px)) best = i;
    });
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min((a ?? -1) + 1, data.days.length - 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max((a ?? data.days.length) - 1, 0));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };
  const activeDay = active === null ? null : data.days[active];
  const valueAt = (label: string, day: string) => data.series.find((s) => s.label === label)?.points.find((p) => p.day === day)?.value;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart block h-auto w-full touch-pan-y"
          role="img"
          tabIndex={0}
          aria-label={`Daily ${unit ?? 'value'} by category, ${data.days.length} days with data. Use left and right arrow keys to inspect a day.`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#ececE8" />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="num" fontSize="10" fill="#6b7280">
                {formatCompact(t)}
              </text>
            </g>
          ))}
          {xLabels.map((d) => (
            <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7280">
              {formatDay(d)}
            </text>
          ))}
          {activeDay && <line x1={x(activeDay)} x2={x(activeDay)} y1={M.top} y2={H - M.bottom} stroke="#94a3b8" strokeDasharray="3 3" />}
          {data.series.map((s, i) => {
            const color = seriesColor(i, s.label);
            const path = s.points.map((p, j) => `${j ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
            return (
              <g key={s.label}>
                <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {s.points.length === 1 && <circle cx={x(s.points[0].day)} cy={y(s.points[0].value)} r="3" fill={color} />}
                {activeDay && valueAt(s.label, activeDay) !== undefined && (
                  <circle cx={x(activeDay)} cy={y(valueAt(s.label, activeDay) as number)} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
                )}
              </g>
            );
          })}
        </svg>
        {activeDay && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-sm"
            style={{left: `${(x(activeDay) / W) * 100}%`, transform: `translateX(${x(activeDay) / W > 0.6 ? '-105%' : '8%'})`}}
          >
            <div className="mb-1 font-medium">{formatDayLong(activeDay)}</div>
            {data.series.map((s, i) => {
              const v = valueAt(s.label, activeDay);
              return (
                <div key={s.label} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block size-2 rounded-full" style={{background: seriesColor(i, s.label)}} />
                    {s.label}
                  </span>
                  <span className="num">{v === undefined ? '—' : formatNumber(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        {data.series.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-4 rounded" style={{background: seriesColor(i, s.label)}} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one per category. `by` decides whether the bar shows the value sum or the record count. */
export function CategoryBars({rows, by, unit}: {rows: CategoryRow[]; by: 'sum' | 'count'; unit: string | null}) {
  const metric = (r: CategoryRow) => (by === 'sum' ? (r.sum ?? 0) : r.count);
  const max = Math.max(...rows.map(metric), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} title={`${r.label}: ${r.count} record${r.count === 1 ? '' : 's'}${r.sum !== null ? `, total ${formatNumber(r.sum)}${unit ? ` ${unit}` : ''}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={`truncate ${r.isMissing ? 'italic text-[var(--muted)]' : ''}`}>{r.label}</span>
            <span className="num shrink-0">
              {formatNumber(metric(r))}
              <span className="ml-1.5 text-xs text-[var(--muted)]">{by === 'sum' ? `${r.count} rec.` : r.count === 1 ? 'record' : 'records'}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#f0f0ec]" aria-hidden>
            <div className="h-2 rounded-full" style={{width: `${(metric(r) / max) * 100}%`, background: seriesColor(i, r.label)}} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One stacked bar plus a legend listing every status found in the data. */
export function StatusBar({rows}: {rows: StatusRow[]}) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[#f0f0ec]" role="img" aria-label={rows.map((r) => `${r.status}: ${r.count}`).join(', ')}>
        {rows.map((r, i) => (
          <div key={r.status} style={{width: `${(r.count / total) * 100}%`, background: statusColor(r.status, r.isMissing, i)}} title={`${titleCase(r.status)}: ${r.count}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <li key={r.status} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <i className="inline-block size-2.5 rounded-sm" style={{background: statusColor(r.status, r.isMissing, i)}} />
              <span className={r.isMissing ? 'italic text-[var(--muted)]' : ''}>{titleCase(r.status)}</span>
            </span>
            <span className="num">
              {r.count}
              <span className="ml-1.5 text-xs text-[var(--muted)]">{Math.round((r.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
