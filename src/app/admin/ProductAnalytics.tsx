'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  getProductAnalytics,
  importSearchAnalytics,
  type ProductAnalyticsRange,
  type ProductAnalyticsReport,
} from '@/lib/admin-client';
import StatCard from './StatCard';

const RANGES: ProductAnalyticsRange[] = [7, 30, 90, 180, 365, 731];
const number = new Intl.NumberFormat('en-US');
const percentage = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const cohortNames: Record<string, string> = {
  d1: 'Day 1 return',
  d7: 'Day 7 return',
  d14: 'Day 14 return',
  d30: 'Day 30 return',
  first_read_14d: 'First reading within 14 days',
  lookup_twice_14d: 'Two lookup days within 14 days',
};

function fraction(part: number, whole: number): string {
  return whole
    ? `${number.format(part)} of ${number.format(whole)} (${percentage.format(part / whole)})`
    : '—';
}

function downloadReport(report: ProductAnalyticsReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `readfox-${report.environment}-analytics-${report.from}-${report.to}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ProductAnalytics() {
  const [range, setRange] = useState<ProductAnalyticsRange>(30);
  const [refresh, setRefresh] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    range: ProductAnalyticsRange;
    data: ProductAnalyticsReport | null;
  }>();
  const report = result?.range === range ? result.data : undefined;

  useEffect(() => {
    let cancelled = false;
    void getProductAnalytics(range).then(
      (data) => {
        if (!cancelled) setResult({ range, data });
      },
      () => {
        if (!cancelled) setResult({ range, data: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [range, refresh]);

  async function importFile(file: File) {
    if (file.size > 512_000) {
      setImportStatus('Choose a JSON report under 512 KB.');
      return;
    }
    setImporting(true);
    setImportStatus('');
    try {
      const imported = await importSearchAnalytics(await file.text());
      setImportStatus(`Imported ${number.format(imported)} search rows.`);
      setRefresh((value) => value + 1);
    } catch {
      setImportStatus('Import failed. Check the report format and date range.');
    } finally {
      setImporting(false);
    }
  }

  const totals = new Map<string, number>();
  for (const row of report?.daily ?? []) {
    totals.set(row.event, (totals.get(row.event) ?? 0) + row.count);
  }
  const legacy = report?.legacyLookupCohort;

  return (
    <section aria-labelledby="product-analytics-title" className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="product-analytics-title"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Product analytics
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Analytics date range"
            value={range}
            onChange={(event) => setRange(Number(event.target.value) as ProductAnalyticsRange)}
          >
            {RANGES.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </Select>
          {report && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadReport(report)}
            >
              Download JSON
            </Button>
          )}
        </div>
      </div>
      {report === undefined && <p className="text-sm text-muted-foreground">Loading analytics…</p>}
      {report === null && (
        <p role="alert" className="text-sm text-destructive">
          Could not load product analytics.
        </p>
      )}
      {report && (
        <>
          <p className="text-xs text-muted-foreground">
            {report.environment} · {report.from} to {report.to} UTC ·{' '}
            {report.coverageStart
              ? `Collection began ${report.coverageStart.slice(0, 10)} UTC`
              : 'Collection has not started'}
          </p>
          <p className="text-xs text-muted-foreground">
            {report.lastMaintenance
              ? `Last maintenance ${report.lastMaintenance}`
              : 'No completed maintenance run'}{' '}
            · {number.format(report.writeFailuresSinceStart)} write failures since server start
          </p>
          {(report.truncated.daily || report.truncated.search) && (
            <p role="status" className="text-sm text-muted-foreground">
              This range shows the latest 25,000 rows per data source. Select a shorter range for
              complete totals.
            </p>
          )}
          {totals.size > 0 ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Public page views"
                value={number.format(totals.get('page_view') ?? 0)}
              />
              <StatCard
                label="Recorded sign-ups"
                value={number.format(totals.get('signup_created') ?? 0)}
              />
              <StatCard
                label="Reading completions"
                value={number.format(totals.get('reading_completed') ?? 0)}
              />
              <StatCard
                label="Completed vocabulary tests"
                value={number.format(totals.get('quiz_finished') ?? 0)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No product events recorded in this range.
            </p>
          )}
          {legacy && (
            <p className="text-sm text-muted-foreground">
              {legacy.from} to {legacy.to} signup cohort · At least two lookup days in the first 14
              learner-local days: {fraction(legacy.returned, legacy.eligible)}
            </p>
          )}
          {report.cohorts.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
              <table className="w-full text-sm tabular-nums">
                <caption className="mb-2 text-left font-medium">
                  Sign-up cohorts with completed observation windows
                </caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-4">Sign-up period</th>
                    <th className="py-1 pr-4">Source</th>
                    <th className="py-1 pr-4">Measure</th>
                    <th className="py-1 text-right">Learners</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cohorts.map((row) => (
                    <tr
                      key={`${row.period}:${row.source}:${row.metric}`}
                      className="border-t border-border"
                    >
                      <td className="py-1 pr-4">{row.period}</td>
                      <td className="py-1 pr-4">{row.source}</td>
                      <td className="py-1 pr-4">{cohortNames[row.metric] ?? row.metric}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {fraction(row.returned, row.eligible)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No eligible sign-up cohorts in this range.
            </p>
          )}
          {report.search.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Imported search data · {number.format(report.search.length)} rows in this range.
              Download JSON for the source, query and landing page breakdown.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No imported search data in this range.</p>
          )}
        </>
      )}
      <div className="space-y-1 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          Import search report
          <input
            type="file"
            accept=".json,application/json"
            disabled={importing}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void importFile(file);
            }}
          />
        </label>
        {importStatus && <p role="status">{importStatus}</p>}
      </div>
    </section>
  );
}
