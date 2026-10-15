'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-base';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getEntitlements,
  invalidateEntitlementsCache,
  type ClientEntitlements,
} from '@/lib/data-layer';

type ByokProvider = 'openrouter' | 'anthropic';
interface ProviderConfig {
  label: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: Array<{ id: string; label: string }>;
}
interface ByokStatus {
  available: boolean;
  enabled: boolean;
  provider: ByokProvider;
  model: string;
  providers: Record<ByokProvider, ProviderConfig>;
  requiresPaidPlan?: boolean;
}

export default function BYOKSettings() {
  const t = useTranslations('settings.byok');
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ByokProvider>('openrouter');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<ClientEntitlements['plan'] | null>(null);

  const load = async () => {
    const res = await apiFetch('/api/byok');
    if (!res.ok) throw new Error('Could not load BYOK settings');
    const next = (await res.json()) as ByokStatus;
    setStatus(next);
    setProvider(next.provider);
    setModel(next.model);
  };

  useEffect(() => {
    load().catch(() => toast.error(t('loadFailed')));
    getEntitlements().then((entitlements) => setPlan(entitlements?.plan ?? null));
  }, [t]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/byok', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, model }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || t('enableFailed'));
      invalidateEntitlementsCache();
      setApiKey('');
      setEditing(false);
      await load();
      toast.success(t('keyActive', { provider: status?.providers[provider].label ?? provider }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('enableFailed'));
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/byok', { method: 'DELETE' });
      if (!res.ok) throw new Error(t('disableFailed'));
      invalidateEntitlementsCache();
      setApiKey('');
      setEditing(false);
      await load();
      toast.success(t('reverted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('disableFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="byok" className="panel scroll-mt-6 p-6">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        {status?.enabled && (
          <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-primary">
            {t('active')}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {plan === 'free' ? t('introFree') : t('introPaid')} {t('introTail')}
      </p>

      {plan === 'free' && !status?.requiresPaidPlan && (
        <p className="mb-4 rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-xs text-foreground">
          {t.rich('compareCloud', {
            link: (chunks) => (
              <a href="/subscribe" className="font-semibold text-primary hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      )}

      {status?.requiresPaidPlan ? (
        <p className="text-sm text-muted-foreground" data-testid="byok-paid-only">
          {t.rich('paidOnly', {
            link: (chunks) => (
              <a href="/subscribe" className="font-semibold text-primary hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      ) : status && !status.available ? (
        <p className="text-sm text-muted-foreground">{t('notConfigured')}</p>
      ) : status ? (
        <div className="space-y-4">
          <div>
            <label
              className="mb-2 block text-sm font-medium text-foreground"
              htmlFor="byok-provider"
            >
              {t('provider')}
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(event) => {
                const next = event.target.value as ByokProvider;
                setProvider(next);
                setModel(status.providers[next].defaultModel);
                setApiKey('');
              }}
              disabled={status.enabled && !editing}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
            >
              {Object.entries(status.providers).map(([id, config]) => (
                <option key={id} value={id}>
                  {config.label}
                </option>
              ))}
            </select>
            {provider === 'openrouter' && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t.rich('evalNote', {
                  link: (chunks) => (
                    <a
                      href="https://lector.dev/blog/local-llm-translation-eval/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="byok-model">
              {t('model')}
            </label>
            <select
              id="byok-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={status.enabled && !editing}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
            >
              {status.providers[provider].models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {status.enabled && !editing ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t('replaceKey')}
              </Button>
              <Button variant="destructive" onClick={disable} disabled={saving}>
                {t('useManaged')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="byok-key">
                {t('apiKeyLabel', { provider: status.providers[provider].label })}{' '}
                {status.enabled && provider === status.provider && (
                  <span className="font-normal text-muted-foreground">{t('leaveBlank')}</span>
                )}
              </label>
              <input
                id="byok-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status.providers[provider].keyPlaceholder}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <div className="flex gap-2">
                <Button
                  onClick={save}
                  disabled={
                    saving ||
                    !model ||
                    (!apiKey.trim() && (!status.enabled || provider !== status.provider))
                  }
                >
                  {saving ? t('saving') : status.enabled ? t('saveChanges') : t('validateEnable')}
                </Button>
                {status.enabled && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setApiKey('');
                      setProvider(status.provider);
                      setModel(status.model);
                    }}
                  >
                    {t('cancel')}
                  </Button>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t('validates', { provider: status.providers[provider].label })}
          </p>
          <details className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              {t('protectedTitle')}
            </summary>
            <div className="mt-2 space-y-2">
              <p>{t('protectedEncryption')}</p>
              <p>{t('protectedStorage')}</p>
              <p>
                {t.rich('protectedOpenSource', {
                  link: (chunks) => (
                    <a
                      href="https://github.com/heuwels/lector"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </div>
          </details>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      )}
    </section>
  );
}
