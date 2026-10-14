import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { deleteSetting, getSetting, setSetting } from '@/lib/data-layer';
import { apiFetch } from '@/lib/api-base';
import { Button } from '@/components/ui/button';
import { LLMProvider, LLMStatus, OpenAIPreset } from './types';
import { toast } from 'sonner';

// Presets are pure UI convenience — they autofill the endpoint and nothing else.
// The backend only ever sees one OpenAI-compatible provider (endpoint + key + model).
const PRESET_ENDPOINTS: Record<Exclude<OpenAIPreset, 'custom'>, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

export default function LLMSettings() {
  const t = useTranslations('settings.llm');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('openai');

  // OpenAI-compatible (Ollama / LM Studio / Apfel / vLLM / …) — one shared config
  const [openaiPreset, setOpenaiPreset] = useState<OpenAIPreset>('custom');
  const [openaiUrl, setOpenaiUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [openaiFetchingModels, setOpenaiFetchingModels] = useState(false);
  const [openaiFetchError, setOpenaiFetchError] = useState<string | null>(null);
  const [hasOpenaiApiKey, setHasOpenaiApiKey] = useState(false);
  const [newOpenaiApiKey, setNewOpenaiApiKey] = useState('');
  const [editingOpenaiApiKey, setEditingOpenaiApiKey] = useState(false);
  const openaiAutoFetchedForUrl = useRef<string | null>(null);

  // Anthropic (cloud) — unchanged
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasOauthToken, setHasOauthToken] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newOauthToken, setNewOauthToken] = useState('');
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [editingOauthToken, setEditingOauthToken] = useState(false);
  const [anthropicAuthMode, setAnthropicAuthMode] = useState<'api_key' | 'oauth'>('api_key');

  const [isFetchingLlmStatus, setIsFetchingLlmStatus] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    // Load LLM provider settings from server. Any legacy local provider
    // (ollama / apfel / lmstudio) is normalized to the unified 'openai' panel —
    // the server-side migration carries their old config across.
    getSetting<string>('llmProvider').then((p) => {
      setLlmProvider(p === 'anthropic' ? 'anthropic' : 'openai');
    });
    getSetting<string>('openaiPreset').then((p) => {
      if (p === 'custom' || p === 'ollama' || p === 'lmstudio') setOpenaiPreset(p);
    });
    getSetting<string>('openaiUrl').then((u) => {
      if (u) setOpenaiUrl(u);
    });
    getSetting<string>('openaiModel').then((m) => {
      if (m) setOpenaiModel(m);
    });
    getSetting<boolean>('openaiApiKey').then((v) => {
      setHasOpenaiApiKey(v === true);
    });
    getSetting<boolean>('anthropicApiKey').then((v) => {
      setHasApiKey(v === true);
    });
    getSetting<boolean>('claudeOauthToken').then((v) => {
      setHasOauthToken(v === true);
    });
    getSetting<string>('anthropicAuthMode').then((m) => {
      if (m === 'api_key' || m === 'oauth') setAnthropicAuthMode(m);
    });

    primeLlmStatus();
  }, []);

  // Auto-fetch models when the user lands on Settings with an OpenAI-compatible
  // endpoint configured but the in-memory list is empty (e.g. on a page refresh —
  // we don't persist the fetched list, only the selected model id). Tracks the
  // last URL we fetched for to avoid refetching after a fetch returns empty.
  useEffect(() => {
    if (llmProvider !== 'openai') return;
    if (!openaiUrl) return;
    if (openaiFetchingModels) return;
    if (openaiModels.length > 0) return;
    if (openaiAutoFetchedForUrl.current === openaiUrl) return;
    openaiAutoFetchedForUrl.current = openaiUrl;
    fetchOpenaiModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchOpenaiModels is stable for our purposes; including it would cause re-runs on every render
  }, [llmProvider, openaiUrl, openaiFetchingModels, openaiModels.length]);

  const primeLlmStatus = async () => {
    setIsFetchingLlmStatus(true);

    try {
      const req = await apiFetch('/api/llm-status');
      const res = await req.json();

      setLlmStatus(res);
    } catch (e) {
      console.error(e);
      toast.error(t('fetchStatusFailed'));
    } finally {
      setIsFetchingLlmStatus(false);
    }
  };

  const runSettingMutation = (mutation: Promise<unknown>) => {
    void mutation.catch((error) => {
      toast.error(error instanceof Error ? error.message : t('saveFailed'));
    });
  };

  // Save LLM provider setting
  const saveLLMProvider = async (provider: LLMProvider) => {
    setLlmProvider(provider);
    await setSetting('llmProvider', provider);
    // Reset the cached provider on the server
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    // Refresh status
    await primeLlmStatus();
  };

  // Whenever endpoint or apiKey changes, the previously-selected model may not
  // exist on the new endpoint and any prior fetch is stale. Clear them so the
  // user re-fetches and re-selects.
  const resetOpenaiModelSelection = async () => {
    setOpenaiModel('');
    setOpenaiModels([]);
    setOpenaiFetchError(null);
    openaiAutoFetchedForUrl.current = null;
    await setSetting('openaiModel', '');
  };

  const persistOpenaiUrl = async (url: string) => {
    setOpenaiUrl(url);
    await setSetting('openaiUrl', url);
    await resetOpenaiModelSelection();
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const saveOpenaiPreset = async (preset: OpenAIPreset) => {
    setOpenaiPreset(preset);
    await setSetting('openaiPreset', preset);
    if (preset !== 'custom') {
      await persistOpenaiUrl(PRESET_ENDPOINTS[preset]);
    }
  };

  const saveOpenaiUrl = async (url: string) => {
    // Manual edits mean "custom" — the preset no longer describes the endpoint.
    if (openaiPreset !== 'custom') {
      setOpenaiPreset('custom');
      await setSetting('openaiPreset', 'custom');
    }
    await persistOpenaiUrl(url);
  };

  const saveOpenaiModel = async (model: string) => {
    setOpenaiModel(model);
    await setSetting('openaiModel', model);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const saveOpenaiApiKey = async (key: string) => {
    if (!key.trim()) return;
    await setSetting('openaiApiKey', key);
    setHasOpenaiApiKey(true);
    setNewOpenaiApiKey('');
    setEditingOpenaiApiKey(false);
    await resetOpenaiModelSelection();
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const clearOpenaiApiKey = async () => {
    await deleteSetting('openaiApiKey');
    setHasOpenaiApiKey(false);
    setNewOpenaiApiKey('');
    setEditingOpenaiApiKey(false);
    await resetOpenaiModelSelection();
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const fetchOpenaiModels = async () => {
    setOpenaiFetchingModels(true);
    setOpenaiFetchError(null);
    try {
      // The server reads the saved API key from settings — never sent from the browser.
      const res = await apiFetch('/api/llm/openai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: openaiUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOpenaiFetchError(data?.error || t('statusError', { status: res.status }));
        setOpenaiModels([]);
      } else {
        const list: string[] = Array.isArray(data?.models) ? data.models : [];
        setOpenaiModels(list);
        if (list.length === 0) {
          setOpenaiFetchError(t('noModels'));
        }
      }
    } catch (err) {
      setOpenaiFetchError(err instanceof Error ? err.message : t('fetchModelsFailed'));
      setOpenaiModels([]);
    } finally {
      setOpenaiFetchingModels(false);
    }
  };

  const saveAnthropicApiKey = async (key: string) => {
    await setSetting('anthropicApiKey', key);
    setHasApiKey(true);
    setNewApiKey('');
    setEditingApiKey(false);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const clearAnthropicApiKey = async () => {
    await deleteSetting('anthropicApiKey');
    setHasApiKey(false);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const saveClaudeOauthToken = async (token: string) => {
    await setSetting('claudeOauthToken', token);
    setHasOauthToken(true);
    setNewOauthToken('');
    setEditingOauthToken(false);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const clearClaudeOauthToken = async () => {
    await deleteSetting('claudeOauthToken');
    setHasOauthToken(false);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    await primeLlmStatus();
  };

  const saveAnthropicAuthMode = async (mode: 'api_key' | 'oauth') => {
    setAnthropicAuthMode(mode);
    await setSetting('anthropicAuthMode', mode);
    await apiFetch('/api/llm-status/reset', { method: 'POST' });
    setIsFetchingLlmStatus(true);
    try {
      const res = await apiFetch('/api/llm-status/test', { method: 'POST' });
      const data = await res.json();
      setLlmStatus((prev) =>
        prev
          ? { ...prev, ok: data.ok, error: data.error }
          : { provider: llmProvider, model: openaiModel, ok: data.ok, error: data.error },
      );
    } catch {
      setLlmStatus((prev) => (prev ? { ...prev, ok: false, error: t('unreachable') } : null));
    } finally {
      setIsFetchingLlmStatus(false);
    }
  };

  const testLLMConnection = async () => {
    setIsFetchingLlmStatus(true);
    try {
      const res = await apiFetch('/api/llm-status/test', { method: 'POST' });
      const data = await res.json();
      setLlmStatus((prev) =>
        prev
          ? { ...prev, ok: data.ok, error: data.error }
          : { provider: llmProvider, model: openaiModel, ok: data.ok, error: data.error },
      );
    } catch {
      setLlmStatus((prev) => (prev ? { ...prev, ok: false, error: t('unreachable') } : null));
    } finally {
      setIsFetchingLlmStatus(false);
    }
  };

  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        <div className="flex items-center gap-2">
          <span
            className={clsx(`inline-block h-2 w-2 rounded-full`, {
              'bg-primary': llmStatus?.ok,
              'bg-destructive': !llmStatus?.ok,
              'bg-yellow-500': isFetchingLlmStatus,
            })}
          />
          <span className="text-sm text-muted-foreground">
            {llmStatus?.ok ? t('connected') : llmStatus?.error || t('notConnected')}
            <Button variant="link" onClick={testLLMConnection} disabled={isFetchingLlmStatus}>
              {isFetchingLlmStatus ? t('checking') : t('refresh')}
            </Button>
          </span>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('intro')}</p>

      {/* Provider selector */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-foreground">{t('provider')}</label>
        <select
          value={llmProvider}
          onChange={(e) => runSettingMutation(saveLLMProvider(e.target.value as LLMProvider))}
          data-testid="llm-provider"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        >
          <option value="anthropic">{t('providerAnthropic')}</option>
          <option value="openai">{t('providerOpenai')}</option>
        </select>
      </div>

      {/* Anthropic settings */}
      {llmProvider === 'anthropic' && (
        <div className="mb-4 space-y-4">
          {/* Auth mode toggle — only when both credentials are configured */}
          {hasApiKey && hasOauthToken && (
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t('authMethod')}
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => runSettingMutation(saveAnthropicAuthMode('api_key'))}
                  disabled={isFetchingLlmStatus}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    anthropicAuthMode === 'api_key'
                      ? 'border-primary bg-[var(--primary-soft)] text-primary'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  }`}
                >
                  {t('apiKey')}
                </button>
                <button
                  onClick={() => runSettingMutation(saveAnthropicAuthMode('oauth'))}
                  disabled={isFetchingLlmStatus}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    anthropicAuthMode === 'oauth'
                      ? 'border-primary bg-[var(--primary-soft)] text-primary'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  }`}
                >
                  {t('oauthToken')}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('bothConfigured')}</p>
            </div>
          )}

          {/* API Key */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">{t('apiKey')}</label>
            <p className="mb-2 text-xs text-muted-foreground">
              {t.rich('getKeyFrom', {
                link: (chunks) => (
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
            {hasApiKey && !editingApiKey ? (
              <div className="flex items-center gap-2">
                <span
                  data-testid="anthropic-api-key-status"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-3 py-2 text-sm font-medium text-primary"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  {t('configured')}
                </span>
                <button
                  onClick={() => setEditingApiKey(true)}
                  data-testid="anthropic-api-key-replace"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  {t('replace')}
                </button>
                <button
                  onClick={() => runSettingMutation(clearAnthropicApiKey())}
                  data-testid="anthropic-api-key-clear"
                  className="rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  {t('clear')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-ant-api..."
                  data-testid="anthropic-api-key"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <button
                  onClick={() => runSettingMutation(saveAnthropicApiKey(newApiKey))}
                  disabled={!newApiKey.trim()}
                  data-testid="anthropic-api-key-save"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('save')}
                </button>
                {editingApiKey && (
                  <button
                    onClick={() => {
                      setEditingApiKey(false);
                      setNewApiKey('');
                    }}
                    data-testid="anthropic-api-key-cancel"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border" />
            <span className="mx-3 flex-shrink text-xs text-muted-foreground">{t('or')}</span>
            <div className="flex-grow border-t border-border" />
          </div>

          {/* OAuth Token */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('oauthToken')}{' '}
              <span className="font-normal text-muted-foreground">{t('oauthPlan')}</span>
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              {t.rich('oauthHelp', {
                code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
              })}
            </p>
            {hasOauthToken && !editingOauthToken ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-3 py-2 text-sm font-medium text-primary">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  {t('configured')}
                </span>
                <button
                  onClick={() => setEditingOauthToken(true)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  {t('replace')}
                </button>
                <button
                  onClick={() => runSettingMutation(clearClaudeOauthToken())}
                  className="rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  {t('clear')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newOauthToken}
                  onChange={(e) => setNewOauthToken(e.target.value)}
                  placeholder="sk-ant-oat01-..."
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <button
                  onClick={() => runSettingMutation(saveClaudeOauthToken(newOauthToken))}
                  disabled={!newOauthToken.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('save')}
                </button>
                {editingOauthToken && (
                  <button
                    onClick={() => {
                      setEditingOauthToken(false);
                      setNewOauthToken('');
                    }}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OpenAI-compatible settings (Ollama / LM Studio / Apfel / vLLM / …) */}
      {llmProvider === 'openai' && (
        <div className="mb-4 space-y-4" data-testid="openai-settings">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">{t('preset')}</label>
            <select
              value={openaiPreset}
              onChange={(e) => runSettingMutation(saveOpenaiPreset(e.target.value as OpenAIPreset))}
              data-testid="openai-preset"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            >
              <option value="custom">{t('presetCustom')}</option>
              <option value="ollama">Ollama (localhost:11434)</option>
              <option value="lmstudio">LM Studio (localhost:1234)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('presetHelp')}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('endpoint')}
            </label>
            <input
              type="text"
              value={openaiUrl}
              onChange={(e) => runSettingMutation(saveOpenaiUrl(e.target.value))}
              placeholder="http://localhost:11434"
              data-testid="openai-endpoint"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t.rich('endpointHelp', {
                code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
              })}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('apiKeyOptional')}
            </label>
            {hasOpenaiApiKey && !editingOpenaiApiKey ? (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-md bg-[var(--primary-soft)] px-2 py-1 text-xs font-medium text-primary"
                  data-testid="openai-api-key-status"
                >
                  {t('configured')}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingOpenaiApiKey(true)}
                  className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
                  data-testid="openai-api-key-replace"
                >
                  {t('replace')}
                </button>
                <button
                  type="button"
                  onClick={() => runSettingMutation(clearOpenaiApiKey())}
                  className="rounded-md border border-destructive/40 bg-background px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  data-testid="openai-api-key-clear"
                >
                  {t('clear')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newOpenaiApiKey}
                  onChange={(e) => setNewOpenaiApiKey(e.target.value)}
                  placeholder={t('apiKeyPlaceholder')}
                  data-testid="openai-api-key"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => runSettingMutation(saveOpenaiApiKey(newOpenaiApiKey))}
                  disabled={!newOpenaiApiKey.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  data-testid="openai-api-key-save"
                >
                  {t('save')}
                </button>
                {editingOpenaiApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOpenaiApiKey(false);
                      setNewOpenaiApiKey('');
                    }}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t('apiKeyHelp')}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">{t('model')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                list="openai-model-options"
                value={openaiModel}
                onChange={(e) => runSettingMutation(saveOpenaiModel(e.target.value))}
                placeholder={openaiFetchingModels ? t('fetchingModels') : t('modelPlaceholder')}
                data-testid="openai-model"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
              />
              <datalist id="openai-model-options">
                {openaiModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={fetchOpenaiModels}
                disabled={openaiFetchingModels || !openaiUrl}
                data-testid="openai-fetch-models"
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {openaiFetchingModels ? t('fetching') : t('fetchModels')}
              </button>
            </div>
            {openaiFetchError && (
              <p className="mt-1 text-xs text-destructive" data-testid="openai-fetch-error">
                {openaiFetchError}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {t.rich('modelHelp', {
                code: (chunks) => <code className="rounded bg-muted px-1">{chunks}</code>,
              })}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
