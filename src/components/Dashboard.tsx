import {useMemo} from 'react';
import {
  buildTimeSeries,
  computeKpis,
  groupByCategory,
  groupByStatus,
  sortRecent,
  topByValue,
  type Kpis,
} from '../../shared/analytics.ts';
import type {MetricRecord, RecordsResponse} from '../../shared/types.ts';
import {formatNumber, formatRecordedAt, titleCase} from '../lib/format.ts';
import {statusColor} from '../lib/palette.ts';
import {CategoryBars, StatusBar, TimeSeriesChart} from './Charts.tsx';

function Card({title, note, children, className = ''}: {title: string; note?: string; children: React.ReactNode; className?: string}) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-[var(--muted)]">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Unavailable({children}: {children: React.ReactNode}) {
  return <p className="rounded-lg bg-[#f5f5f2] px-3 py-6 text-center text-sm text-[var(--muted)]">{children}</p>;
}

const unavailableReason = {
  no_values: 'No record has a numeric value.',
  mixed_units: 'Records use different units, so values are not added together.',
} as const;

function KpiCard({label, value, hint}: {label: string; value: string | null; hint: string}) {
  return (
    <div className="card p-5">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-2 text-3xl font-medium tracking-tight ${value === null ? 'text-[var(--muted)]' : ''}`}>{value ?? 'n/a'}</div>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}

export function KpiCards({kpis}: {kpis: Kpis}) {
  const v = kpis.value;
  const unit = v.kind === 'ok' && v.unit ? ` ${v.unit}` : '';
  const na = v.kind === 'unavailable' ? unavailableReason[v.reason] : '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Total records" value={formatNumber(kpis.totalRecords)} hint="Records loaded from the content type" />
      <KpiCard
        label="Total value"
        value={v.kind === 'ok' ? formatNumber(v.sum) : null}
        hint={v.kind === 'ok' ? `Sum of ${v.count} numeric value${v.count === 1 ? '' : 's'}${unit ? `, in${unit}` : ''}` : na}
      />
      <KpiCard
        label="Average value"
        value={v.kind === 'ok' ? formatNumber(v.average) : null}
        hint={v.kind === 'ok' ? `Mean per record that has a value${unit ? `, in${unit}` : ''}` : na}
      />
      <KpiCard
        label="Active records"
        value={kpis.active.kind === 'ok' ? formatNumber(kpis.active.count) : null}
        hint={
          kpis.active.kind === 'ok'
            ? `Status "active", of ${kpis.active.withStatus} with a status`
            : 'No record has a status field value.'
        }
      />
    </div>
  );
}

function StatusPill({status}: {status: string | null}) {
  if (status === null) return <span className="text-[var(--muted)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block size-2 rounded-full" style={{background: statusColor(status, false, 0)}} />
      {titleCase(status)}
    </span>
  );
}

export function RecentTable({records}: {records: MetricRecord[]}) {
  const showTarget = records.some((r) => r.target !== null);
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="eyebrow border-b border-[var(--border)]">
            <th className="py-2 pr-3 font-semibold">Name</th>
            <th className="py-2 pr-3 font-semibold">Category</th>
            <th className="py-2 pr-3 text-right font-semibold">Value</th>
            {showTarget && <th className="py-2 pr-3 text-right font-semibold">Target</th>}
            <th className="py-2 pr-3 font-semibold">Status</th>
            <th className="py-2 font-semibold">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
              <td className="max-w-56 truncate py-2.5 pr-3 font-medium">{r.name ?? <span className="font-normal italic text-[var(--muted)]">Untitled</span>}</td>
              <td className="py-2.5 pr-3">{r.category ?? <span className="italic text-[var(--muted)]">Uncategorized</span>}</td>
              <td className="num py-2.5 pr-3 text-right">{r.value === null ? '—' : formatNumber(r.value)}</td>
              {showTarget && <td className="num py-2.5 pr-3 text-right text-[var(--muted)]">{r.target === null ? '—' : formatNumber(r.target)}</td>}
              <td className="py-2.5 pr-3"><StatusPill status={r.status} /></td>
              <td className="num py-2.5 text-[var(--muted)]">{formatRecordedAt(r.recordedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const seriesReason = {
  no_dated_values: 'No record has both a date and a numeric value, so there is nothing to plot over time.',
  single_day: 'All dated records fall on a single day. At least two different days are needed for a trend.',
  mixed_units: 'Records use different units, so they are not plotted on one axis.',
} as const;

export function Board({data}: {data: RecordsResponse}) {
  const {records} = data;
  const kpis = useMemo(() => computeKpis(records), [records]);
  const series = useMemo(() => buildTimeSeries(records), [records]);
  const byMode = kpis.value.kind === 'ok' ? 'sum' : 'count';
  const categories = useMemo(() => groupByCategory(records, byMode), [records, byMode]);
  const statuses = useMemo(() => groupByStatus(records), [records]);
  const recent = useMemo(() => sortRecent(records, 8), [records]);
  const top = useMemo(() => topByValue(records, 5), [records]);
  const unit = kpis.value.kind === 'ok' ? kpis.value.unit : null;

  return (
    <div className="space-y-4">
      <KpiCards kpis={kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Value over time"
          note={`Daily total${unit ? ` (${unit})` : ''}, by category. Only days with records are plotted.${
            series.kind === 'ok' && series.excluded ? ` ${series.excluded} record${series.excluded === 1 ? '' : 's'} without a date or value not shown.` : ''
          }`}
        >
          {series.kind === 'ok' ? <TimeSeriesChart data={series} unit={unit} /> : <Unavailable>{seriesReason[series.reason]}</Unavailable>}
        </Card>
        <Card title={statuses ? 'Status distribution' : 'Largest values'} note={statuses ? 'Records by status found in the data' : 'No status values exist, so the largest records are shown instead'}>
          {statuses ? (
            <StatusBar rows={statuses} />
          ) : top.length ? (
            <ul className="space-y-2 text-sm">
              {top.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="truncate">{r.name ?? 'Untitled'}</span>
                  <span className="num">{formatNumber(r.value as number)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Unavailable>No numeric values to rank.</Unavailable>
          )}
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="By category"
          note={byMode === 'sum' ? `Total value${unit ? ` (${unit})` : ''} per category` : `Record count per category (${kpis.value.kind === 'unavailable' ? unavailableReason[kpis.value.reason] : ''})`}
        >
          <CategoryBars rows={categories} by={byMode} unit={unit} />
        </Card>
        <Card className="lg:col-span-2" title="Recent records" note="Newest first. Records without a date are listed last.">
          <RecentTable records={recent} />
        </Card>
      </div>
    </div>
  );
}
