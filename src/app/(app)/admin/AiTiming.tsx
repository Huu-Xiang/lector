'use client';

import { useEffect, useState } from 'react';
import { getAiTiming, type AiTiming as AiTimingData, type AiTimingRange } from '@/lib/admin-client';

const RANGES: { days: AiTimingRange; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function ms(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('en-US')} ms`;
}

function hitRate(hits: number, misses: number): string {
  const all = hits + misses;
  return all === 0 ? '—' : `${Math.round((hits / all) * 100)}% of ${all.toLocaleString('en-US')}`;
}

export default function AiTiming() {
  const [range, setRange] = useState<AiTimingRange>(1);
  const [data, setData] = useState<AiTimingData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAiTiming(range)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          AI speed and cache hits
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setRange(r.days)}
              className={`rounded-md border px-2 py-1 text-xs ${
                range === r.days
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {failed && <p className="text-sm text-destructive">Could not load AI timing.</p>}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2">Task</th>
              <th className="p-2">AI calls</th>
              <th className="p-2">p50</th>
              <th className="p-2">p95</th>
              <th className="p-2">Max</th>
              <th className="p-2">First token p50 / p95</th>
              <th className="p-2">Cache or dictionary hit</th>
              <th className="p-2">Errors</th>
              <th className="p-2">Timeouts</th>
            </tr>
          </thead>
          <tbody>
            {(data?.total ?? []).map((t) => (
              <tr key={t.label} className="border-t border-border">
                <td className="p-2 font-medium">{t.label}</td>
                <td className="p-2">{t.calls.toLocaleString('en-US')}</td>
                <td className="p-2">{ms(t.p50)}</td>
                <td className="p-2">{ms(t.p95)}</td>
                <td className="p-2">{ms(t.max)}</td>
                <td className="p-2">
                  {t.firstP50 === null ? '—' : `${ms(t.firstP50)} / ${ms(t.firstP95)}`}
                </td>
                <td className="p-2">{hitRate(t.hits, t.misses)}</td>
                <td className="p-2">{t.errors}</td>
                <td className="p-2">{t.timeouts}</td>
              </tr>
            ))}
            {data && data.total.length === 0 && (
              <tr>
                <td className="p-2 text-muted-foreground" colSpan={9}>
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Times are bucket estimates, counted per UTC day. No user, text or IP is stored.
      </p>
    </section>
  );
}
