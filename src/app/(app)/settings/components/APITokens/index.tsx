import { Button } from '@/components/ui/button';
import { ApiTokenMeta, createApiToken, getApiTokens, revokeApiToken } from '@/lib/data-layer';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function APITokens() {
  const t = useTranslations('settings.apiTokens');
  const format = useFormatter();
  const [apiTokens, setApiTokens] = useState<ApiTokenMeta[]>([]);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>(['*']);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    getApiTokens()
      .then(setApiTokens)
      .catch(() => {
        toast.error(t('fetchFailed'));
      });
  }, [t]);

  const handleCopyTokenButtonPressed = () => {
    if (!createdToken) {
      return;
    }

    navigator.clipboard.writeText(createdToken);
    toast.success(t('copied'));
  };

  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        {!showTokenForm && !createdToken && (
          <Button
            onClick={() => {
              setShowTokenForm(true);
              setTokenError(null);
            }}
          >
            {t('generate')}
          </Button>
        )}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{t('intro')}</p>

      {tokenError && (
        <div className="mb-4 rounded-md bg-[color-mix(in_srgb,var(--destructive)_12%,var(--card))] p-3 text-sm text-destructive">
          {tokenError}
        </div>
      )}

      {/* One-time token display */}
      {createdToken && (
        <div className="mb-4 rounded-md border border-[var(--gold-lip)] bg-[var(--gold-soft)] p-4">
          <p className="mb-2 text-sm font-medium text-[var(--gold-strong)]">{t('copyNow')}</p>
          <div className="mb-2 flex items-center gap-2">
            <code className="flex-1 rounded border border-[var(--gold-lip)] bg-muted px-3 py-2 font-mono text-sm break-all text-foreground select-all">
              {createdToken}
            </code>
            <Button onClick={handleCopyTokenButtonPressed}>{t('copy')}</Button>
          </div>
          <Button variant="outline" onClick={() => setCreatedToken(null)}>
            {t('saved')}
          </Button>
        </div>
      )}

      {/* Create token form */}
      {showTokenForm && (
        <div className="mb-4 rounded-md border border-border bg-muted p-4">
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('tokenName')}
            </label>
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder={t('tokenNamePlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>

          <div className="mb-3">
            <label className="mb-2 block text-sm font-medium text-foreground">{t('scopes')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: '*', label: t('scopeLabels.all') },
                { value: 'collections:read', label: t('scopeLabels.collectionsRead') },
                { value: 'collections:write', label: t('scopeLabels.collectionsWrite') },
                { value: 'vocab:read', label: t('scopeLabels.vocabRead') },
                { value: 'vocab:write', label: t('scopeLabels.vocabWrite') },
                { value: 'stats:read', label: t('scopeLabels.statsRead') },
                { value: 'stats:write', label: t('scopeLabels.statsWrite') },
                { value: 'settings:read', label: t('scopeLabels.settingsRead') },
                { value: 'settings:write', label: t('scopeLabels.settingsWrite') },
                { value: 'data:export', label: t('scopeLabels.dataExport') },
                { value: 'data:import', label: t('scopeLabels.dataImport') },
                { value: 'chat:read', label: t('scopeLabels.chatRead') },
                { value: 'chat:write', label: t('scopeLabels.chatWrite') },
                // The Anki addon's token (#241) — its setup copy points here.
                { value: 'anki:read', label: t('scopeLabels.ankiRead') },
                { value: 'anki:write', label: t('scopeLabels.ankiWrite') },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    newTokenScopes.includes(value)
                      ? 'border-primary bg-[var(--primary-soft)] text-primary'
                      : 'border-input bg-background text-foreground'
                  } ${
                    newTokenScopes.includes('*') && value !== '*'
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:bg-accent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newTokenScopes.includes('*') || newTokenScopes.includes(value)}
                    disabled={newTokenScopes.includes('*') && value !== '*'}
                    onChange={(e) => {
                      if (value === '*') {
                        setNewTokenScopes(e.target.checked ? ['*'] : []);
                      } else {
                        setNewTokenScopes((prev) =>
                          e.target.checked
                            ? [...prev.filter((s) => s !== '*'), value]
                            : prev.filter((s) => s !== value),
                        );
                      }
                    }}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!newTokenName.trim()) {
                  setTokenError(t('nameRequired'));
                  return;
                }
                if (newTokenScopes.length === 0) {
                  setTokenError(t('scopeRequired'));
                  return;
                }
                try {
                  setTokenError(null);
                  const result = await createApiToken({
                    name: newTokenName.trim(),
                    scopes: newTokenScopes,
                  });
                  setCreatedToken(result.token);
                  setShowTokenForm(false);
                  setNewTokenName('');
                  setNewTokenScopes(['*']);
                  const tokens = await getApiTokens();
                  setApiTokens(tokens);
                } catch (err) {
                  setTokenError(err instanceof Error ? err.message : t('createFailed'));
                }
              }}
              disabled={!newTokenName.trim() || newTokenScopes.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('create')}
            </button>
            <button
              onClick={() => {
                setShowTokenForm(false);
                setNewTokenName('');
                setNewTokenScopes(['*']);
                setTokenError(null);
              }}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {apiTokens.length > 0 ? (
        <div className="space-y-2">
          {apiTokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{token.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {(token.scopes.includes('*') ? [t('scopeLabels.all')] : token.scopes).map(
                      (scope) => (
                        <span
                          key={scope}
                          className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {scope}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('created', { date: format.dateTime(new Date(token.createdAt)) })}
                  {' · '}
                  {token.lastUsedAt
                    ? t('lastUsed', { date: format.dateTime(new Date(token.lastUsedAt)) })
                    : t('neverUsed')}
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm(t('revokeConfirm', { name: token.name }))) return;
                  try {
                    await revokeApiToken(token.id);
                    setApiTokens((prev) => prev.filter((t) => t.id !== token.id));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t('revokeFailed'));
                  }
                }}
                className="ml-3"
              >
                {t('revoke')}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        !showTokenForm && <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}
    </section>
  );
}
