'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useIsDark } from '@/utils/hooks';
import { darkChartTheme, lightChartTheme } from '@/components/VocabGrowthChart/theme';
import { getAdminTrends, type AdminTrendRange, type AdminTrends } from '@/lib/admin-client';
import StatCard from './StatCard';

const RANGES: AdminTrendRange[] = [7, 30, 90];

// Concrete hex: recharts SVG props do not resolve CSS variables. Same as --chart-1..3.
const COLORS = {
  light: ['#2f8a76', '#c0744f', '#cf9a3d'],
  dark: ['#54ab92', '#d18c63', '#d7a64c'],
};

function yuan(fen: number): string {
  return `¥${(fen / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Trends() {
  const [range, setRange] = useState<AdminTrendRange>(30);
  const [data, setData] = useState<AdminTrends | null>(null);
  const [failed, setFailed] = useState(false);
  const isDark = useIsDark();
  const theme = isDark ? darkChartTheme : lightChartTheme;
  const [c1, c2, c3] = isDark ? COLORS.dark : COLORS.light;

  useEffect(() => {
    let cancelled = false;
    getAdminTrends(range)
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

  const chartData = (data?.daily ?? []).map((d) => ({ ...d, label: shortDate(d.date) }));
  const signups = data?.funnel.signedUp ?? 0;
  const avgActive = chartData.length
    ? chartData.reduce((sum, d) => sum + d.active, 0) / chartData.length
    : 0;
  const peakActive = chartData.reduce((max, d) => Math.max(max, d.active), 0);
  const axis = {
    stroke: theme.axis,
    fontSize: 12,
    tickLine: false,
    axisLine: { stroke: theme.grid },
  };
  const tooltip = {
    cursor: { fill: theme.grid, opacity: 0.4 },
    contentStyle: {
      borderRadius: 8,
      border: `1px solid ${theme.grid}`,
      background: isDark ? '#211d16' : '#fffdf7',
      color: isDark ? '#ece5d6' : '#2c2a23',
      fontSize: 12,
    },
  };

  const funnelSteps = data
    ? [
        { label: 'Signed up', n: data.funnel.signedUp },
        { label: 'Verified email', n: data.funnel.verified },
        { label: 'Finished setup', n: data.funnel.finishedSetup },
        { label: 'Studied once', n: data.funnel.studied },
        { label: 'Finished guided tour', n: data.funnel.finishedOnboarding },
        { label: 'Came back another day', n: data.funnel.cameBack },
      ]
    : [];

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Trends
        </h2>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground">
              UTC days · {data.excludedAccounts} operator account
              {data.excludedAccounts === 1 ? '' : 's'} left out
            </span>
          )}
          <div className="flex rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  range === r
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>
      </div>

      {failed && !data && <p className="text-sm text-destructive">Could not load the trends.</p>}

      {data && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={`New accounts (${range}d)`}
              value={signups}
              hint={`${data.funnel.verified} verified (${percent(data.funnel.verified, signups)})`}
            />
            <StatCard
              label="Daily active (avg)"
              value={avgActive.toFixed(1)}
              hint={`peak ${peakActive}`}
            />
            <StatCard
              label="Back next day"
              value={percent(data.retention.nextDay.returned, data.retention.nextDay.eligible)}
              hint={`${data.retention.nextDay.returned} of ${data.retention.nextDay.eligible} · a week later ${percent(
                data.retention.afterWeek.returned,
                data.retention.afterWeek.eligible,
              )} (${data.retention.afterWeek.returned} of ${data.retention.afterWeek.eligible})`}
            />
            <StatCard
              label={`RMB revenue (${range}d)`}
              value={yuan(data.rmb.fen)}
              hint={`${data.rmb.orders} orders · ${data.rmb.refundedOrders} refunded (${yuan(data.rmb.refundedFen)})`}
            />
          </div>

          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <ChartCard title="New accounts and active learners">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="label" {...axis} minTickGap={24} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: theme.legend }} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="signups"
                    name="New accounts"
                    fill={c2}
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    isAnimationActive={false}
                    type="linear"
                    dataKey="active"
                    name="Active learners"
                    stroke={c1}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Lookups and AI translations"
              note="paid AI calls are counted per month (Rich AI above)"
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                  <XAxis dataKey="label" {...axis} minTickGap={24} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: theme.legend }} />
                  <Bar
                    isAnimationActive={false}
                    dataKey="lookups"
                    name="Lookups"
                    stackId="ai"
                    fill={c1}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="freePhraseTranslations"
                    name="Phrase (Free)"
                    stackId="ai"
                    fill={c2}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="freeContextTranslations"
                    name="In context (Free)"
                    stackId="ai"
                    fill={c3}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={`New-account funnel (${range}d)`} note="accounts created in this range">
            <ul className="space-y-2">
              {funnelSteps.map((step) => (
                <li
                  key={step.label}
                  className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_6.5rem]"
                >
                  <span className="text-sm text-foreground">{step.label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: signups ? `${(step.n / signups) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-right text-sm text-muted-foreground tabular-nums">
                    {step.n} · {percent(step.n, signups)}
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </>
      )}
    </section>
  );
}
