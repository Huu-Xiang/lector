'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminTrends, type AdminTrendRange, type AdminTrends } from '@/lib/admin-client';
import { useLectorMode } from '@/lib/use-env';

const RANGES: AdminTrendRange[] = [7, 30, 90];

type Step = { key: keyof AdminTrends['funnel']; label: string; note: string };

/** The order a learner usually reaches them; a later step can count more accounts. */
const STEPS: Step[] = [
  { key: 'signedUp', label: 'Signed up', note: 'accounts created in the range' },
  { key: 'verified', label: 'Verified email', note: '' },
  { key: 'finishedSetup', label: 'Finished setup', note: 'language, level and interests' },
  { key: 'lookedUp', label: 'Looked up a word', note: 'any dictionary or AI lookup' },
  { key: 'savedWord', label: 'Saved a word', note: 'any vocabulary entry' },
  { key: 'finishedOnboarding', label: 'Finished guided tour', note: 'tap, save, practice' },
  { key: 'cameBack', label: 'Came back another day', note: 'studied after the signup day' },
  { key: 'hitLimit', label: 'Used up an AI allowance', note: 'reached a daily or monthly limit' },
  { key: 'paid', label: 'Paid', note: 'RMB order or card subscription' },
];

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

export default function AdminFunnelPage() {
  const mode = useLectorMode();
  const [range, setRange] = useState<AdminTrendRange>(30);
  const [data, setData] = useState<AdminTrends | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'cloud') return;
    let cancelled = false;
    getAdminTrends(range)
      .then((trends) => {
        if (!cancelled) {
          setData(trends);
          setError(null);
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mode, range]);

  if (mode !== 'unknown' && mode !== 'cloud') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">Admin is only available in cloud mode.</main>
    );
  }

  const signups = data?.funnel.signedUp ?? 0;
  const biggestDrop = data
    ? STEPS.slice(1).reduce<{ key: string; lost: number } | null>((worst, step, i) => {
        const lost = data.funnel[STEPS[i].key] - data.funnel[step.key];
        return !worst || lost > worst.lost ? { key: step.key, lost } : worst;
      }, null)
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8" data-testid="admin-funnel">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Admin
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Conversion funnel</h1>
          <p className="text-sm text-muted-foreground">
            New accounts in the last {range} days, from sign-up to payment. Operator and
            billing-exempt accounts are left out
            {data ? ` (${data.excludedAccounts})` : ''}.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {RANGES.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={range === days}
              onClick={() => setRange(days)}
              className={`rounded-md px-3 py-1 text-sm ${
                range === days
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Step</th>
                <th className="px-4 py-2 font-medium">Accounts</th>
                <th className="w-1/3 px-4 py-2 font-medium">Of sign-ups</th>
                <th className="px-4 py-2 text-right font-medium">From previous step</th>
              </tr>
            </thead>
            <tbody>
              {STEPS.map((step, i) => {
                const n = data.funnel[step.key];
                const previous = i === 0 ? n : data.funnel[STEPS[i - 1].key];
                const worst = biggestDrop?.key === step.key && biggestDrop.lost > 0;
                return (
                  <tr
                    key={step.key}
                    className={`border-t border-border ${worst ? 'bg-[var(--gold-soft)]' : ''}`}
                    data-testid={`funnel-step-${step.key}`}
                  >
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{step.label}</p>
                      {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{n}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: signups ? `${(n / signups) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="w-10 text-right text-muted-foreground tabular-nums">
                          {percent(n, signups)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                      {i === 0 ? '—' : percent(n, previous)}
                      {worst && <span className="ml-2 text-xs font-semibold">biggest drop</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Visitors before sign-up are not counted: the app keeps no page-view tracking. Caddy access
        logs on the server hold masked page visits.
      </p>
    </main>
  );
}
