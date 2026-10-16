'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { Info, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getEntitlements, invalidateEntitlementsCache } from '@/lib/data-layer';
import type { ClientEntitlements } from '@/lib/data-layer';
import { AI_USAGE_EVENT } from '@/constants/storage';

const REFRESH_MS = 60_000;
const EVENT_DEBOUNCE_MS = 1_500;
const OPEN_KEY = 'readfox-ai-quota-open';
const RING_RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

const OPEN_EVENT = 'readfox-ai-quota-open';
const TIP_KEY = 'readfox-ai-quota-tip-seen';
const TIP_EVENT = 'readfox-ai-quota-tip';

function readTipSeen(): boolean {
  try {
    return window.localStorage.getItem(TIP_KEY) === '1';
  } catch {
    return true;
  }
}

function markTipSeen(): void {
  try {
    window.localStorage.setItem(TIP_KEY, '1');
  } catch {
    /* the tip then returns on the next visit */
  }
  window.dispatchEvent(new Event(TIP_EVENT));
}

function subscribeTip(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(TIP_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(TIP_EVENT, callback);
  };
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* storage can be blocked; the choice then lasts until reload */
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribeOpen(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(OPEN_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(OPEN_EVENT, callback);
  };
}

function toneFor(ratio: number): string {
  if (ratio >= 1) return 'text-destructive';
  if (ratio >= 0.8) return 'text-[var(--gold)]';
  return 'text-primary';
}

function Ring({ ratio }: { ratio: number }) {
  return (
    <svg viewBox="0 0 36 36" className={clsx('size-8 -rotate-90', toneFor(ratio))} aria-hidden>
      <circle
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        className="stroke-muted"
      />
      <circle
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={`${RING_LENGTH * Math.min(ratio, 1)} ${RING_LENGTH}`}
        className="transition-[stroke-dasharray]"
      />
    </svg>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const t = useTranslations('chrome.quota');
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 1;
  const left = Math.max(limit - used, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground">{label}</span>
        <span
          className={clsx(
            'tabular-nums',
            left === 0 ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {left === 0 ? t('exhausted') : t('left', { left: left.toLocaleString() })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={t('used', { used: used.toLocaleString(), limit: limit.toLocaleString() })}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={clsx('h-full rounded-full bg-current transition-[width]', toneFor(ratio))}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function AiQuota({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('chrome.quota');
  const [entitlements, setEntitlements] = useState<ClientEntitlements | null>(null);
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const tipSeen = useSyncExternalStore(subscribeTip, readTipSeen, () => true);

  const load = useCallback(() => {
    invalidateEntitlementsCache();
    getEntitlements()
      .then(setEntitlements)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUsage = () => {
      clearTimeout(timer);
      timer = setTimeout(load, EVENT_DEBOUNCE_MS);
    };
    const interval = setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    window.addEventListener(AI_USAGE_EVENT, onUsage);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', load);
      window.removeEventListener(AI_USAGE_EVENT, onUsage);
    };
  }, [load]);

  if (!entitlements || entitlements.plan === 'unlimited') return null;

  const meters = entitlements.byok
    ? []
    : [
        { key: 'wordGlossesPerMonth', label: t('lookups') },
        { key: 'llmRequestsPerMonth', label: t('requests') },
      ].flatMap(({ key, label }) => {
        const limit = entitlements.limits[key];
        return typeof limit === 'number'
          ? [{ key, label, limit, used: entitlements.usage[key] ?? 0 }]
          : [];
      });
  if (!entitlements.byok && meters.length === 0) return null;

  const ratio = Math.max(
    0,
    ...meters.map((meter) => (meter.limit > 0 ? meter.used / meter.limit : 1)),
  );
  const percent = Math.round(Math.min(ratio, 1) * 100);
  const summary = entitlements.byok
    ? t('byok')
    : `${t('title')} · ${t('percentUsed', { percent })}`;

  function toggle() {
    markTipSeen();
    writeOpen(!open);
  }

  if (compact) {
    return (
      <div data-testid="ai-quota" className="flex justify-center py-1" title={summary}>
        <Ring ratio={ratio} />
        <span className="sr-only">{summary}</span>
      </div>
    );
  }

  return (
    <section data-testid="ai-quota" className="relative mx-3 mb-2">
      {!tipSeen && !open && (
        <div
          role="status"
          data-testid="ai-quota-tip"
          className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-primary/40 bg-[var(--primary-soft)] p-3 text-xs text-foreground shadow-md"
        >
          <p className="pr-4">{t('tip')}</p>
          <button
            type="button"
            onClick={markTipSeen}
            aria-label={t('tipDismiss')}
            data-testid="ai-quota-tip-dismiss"
            className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      {open && (
        <div
          id="ai-quota-details"
          className="mb-2 space-y-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('title')}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    aria-label={t('info')}
                    data-testid="ai-quota-info"
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="block max-w-56 space-y-1">
                    <p>{t('note')}</p>
                    <p>{t('resets')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label={t('close')}
              title={t('close')}
              data-testid="ai-quota-close"
              className="-mr-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {entitlements.byok ? (
            <p className="text-xs text-muted-foreground">{t('byok')}</p>
          ) : (
            <>
              {meters.map((meter) => (
                <Meter key={meter.key} label={meter.label} used={meter.used} limit={meter.limit} />
              ))}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="ai-quota-details"
        aria-label={summary}
        title={summary}
        data-testid="ai-quota-toggle"
        className="flex items-center rounded-full transition-colors hover:bg-accent"
      >
        <Ring ratio={ratio} />
      </button>
    </section>
  );
}
