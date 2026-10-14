import { Button } from '@/components/ui/button';
import { getDeckNames, isAnkiConnected, refreshAnkiUrl } from '@/lib/anki';
import { type AnkiTransport, useAnkiTransport } from '@/lib/anki-transport';
import { apiBase } from '@/lib/api-base';
import { getSetting, setSetting } from '@/lib/data-layer';
import { useLectorMode } from '@/lib/use-env';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SETTINGS_KEYS } from '../../constants';

/**
 * Two transports (#241), chosen by the user — not inferred from deployment:
 *
 *   - AnkiConnect: browser→localhost, the selfhost default (today's app).
 *   - Lector Sync add-on: server-side queue, pulled from inside Anki. The
 *     only transport that works from a hosted page (Chrome's Local Network
 *     Access blocks public HTTPS → loopback), so cloud locks to it; a
 *     self-hoster can opt in when their Lector is HTTPS or on another box —
 *     the same browser constraints bite there.
 */

/** Setup instructions for the Lector Sync addon — shared by both modes. */
function AnkiAddonBody() {
  const t = useTranslations('settings.anki');
  const code = (chunks: React.ReactNode) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs">{chunks}</code>
  );
  return (
    <>
      <p className="text-sm text-muted-foreground">{t('addonIntro')}</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
        <li>
          {t.rich('addonStep1', {
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
            code,
          })}
        </li>
        <li>
          {t.rich('addonStep2', {
            link: (chunks) => (
              <a
                className="text-primary underline underline-offset-2"
                href="https://github.com/heuwels/lector/tree/master/anki-addon"
                target="_blank"
                rel="noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </li>
        <li>{t.rich('addonStep3', { code })}</li>
      </ol>
      <div>
        <label className="block text-sm font-medium text-foreground">{t('apiUrl')}</label>
        <input
          type="text"
          readOnly
          value={apiBase()}
          data-testid="anki-addon-api-url"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('addonMobile')}</p>
    </>
  );
}

export default function AnkiSettings() {
  const t = useTranslations('settings.anki');
  const mode = useLectorMode();
  const resolvedTransport = useAnkiTransport();
  // The saved choice loads async; a click wins immediately over it.
  const [transportOverride, setTransportOverride] = useState<AnkiTransport | null>(null);
  const transport = transportOverride ?? resolvedTransport;

  const [ankiClozeDeckName, setAnkiClozeDeckName] = useState('');
  const [ankiDeckName, setAnkiDeckName] = useState('');
  const [defaultCardType, setDefaultCardType] = useState('');
  const [ankiConnected, setAnkiConnected] = useState(false);
  const [ankiDecks, setAnkiDecks] = useState<string[]>([]);
  const [ankiLoading, setAnkiLoading] = useState(false);
  const [ankiError, setAnkiError] = useState<string | null>(null);
  const [ankiConnectUrl, setAnkiConnectUrl] = useState('http://localhost:8765');

  const chooseTransport = (next: AnkiTransport) => {
    const previous = transport === 'addon' || transport === 'ankiconnect' ? transport : null;
    setTransportOverride(next);
    void setSetting('ankiTransport', next).catch((error) => {
      setTransportOverride(previous);
      setAnkiError(error instanceof Error ? error.message : t('saveTransportFailed'));
    });
  };

  useEffect(() => {
    if (transport !== 'ankiconnect') return;
    getSetting<string>('ankiConnectUrl').then((url) => {
      if (url) setAnkiConnectUrl(url);
    });
    setAnkiClozeDeckName(localStorage.getItem(SETTINGS_KEYS.ANKI_CLOZE_DECK_NAME) || '');
    setAnkiDeckName(localStorage.getItem(SETTINGS_KEYS.ANKI_DECK_NAME) || '');
    setDefaultCardType(localStorage.getItem(SETTINGS_KEYS.DEFAULT_CARD_TYPE) || '');
  }, [transport]);

  const checkAnkiConnection = useCallback(async () => {
    setAnkiLoading(true);
    setAnkiError(null);
    try {
      const connected = await isAnkiConnected();
      setAnkiConnected(connected);
      if (connected) {
        const decks = await getDeckNames();
        setAnkiDecks(decks);
      }
    } catch {
      setAnkiError(t('connectFailed'));
      setAnkiConnected(false);
    } finally {
      setAnkiLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Probe only on the browser-direct transport: on 'addon' (and while the
    // choice is still resolving) the fetch is pointless — and from a hosted
    // page it's blocked by Local Network Access and mis-reads as "Anki isn't
    // running".
    if (transport !== 'ankiconnect') return;
    checkAnkiConnection();
  }, [transport, checkAnkiConnection]);

  // Cloud: the add-on is the only transport that can work — no picker.
  if (mode === 'cloud') {
    return (
      <section
        id="anki-integration"
        className="panel scroll-mt-6 space-y-4 p-6"
        data-testid="anki-addon-panel"
      >
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        <AnkiAddonBody />
      </section>
    );
  }

  return (
    <section
      id="anki-integration"
      className="panel scroll-mt-6 space-y-4 p-6"
      data-testid={transport === 'addon' ? 'anki-addon-panel' : undefined}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
        {transport === 'ankiconnect' && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                ankiConnected ? 'bg-primary' : 'bg-destructive'
              }`}
            />
            <span className="text-sm text-muted-foreground">
              {ankiConnected ? t('connected') : t('notConnected')}
            </span>
            <Button variant="link" onClick={checkAnkiConnection} disabled={ankiLoading}>
              {ankiLoading ? t('checking') : t('refresh')}
            </Button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">{t('connection')}</label>
        <p className="mb-2 text-xs text-muted-foreground">{t('connectionHelp')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="anki-transport-ankiconnect"
            onClick={() => chooseTransport('ankiconnect')}
            variant={transport === 'ankiconnect' ? 'default' : 'secondary'}
          >
            {t('transportAnkiConnect')}
          </Button>
          <Button
            data-testid="anki-transport-addon"
            onClick={() => chooseTransport('addon')}
            variant={transport === 'addon' ? 'default' : 'secondary'}
          >
            {t('transportAddon')}
          </Button>
        </div>
      </div>

      {transport === 'addon' ? (
        <AnkiAddonBody />
      ) : (
        <>
          {ankiError && (
            <div className="rounded-md bg-[color-mix(in_srgb,var(--destructive)_12%,var(--card))] p-3 text-sm text-destructive">
              {ankiError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground">
              {t('ankiConnectUrl')}
            </label>
            <p className="mb-2 text-xs text-muted-foreground">{t('urlHint')}</p>
            <input
              type="text"
              value={ankiConnectUrl}
              onChange={(e) => {
                setAnkiConnectUrl(e.target.value);
                void setSetting('ankiConnectUrl', e.target.value).catch((error) => {
                  setAnkiError(error instanceof Error ? error.message : t('saveUrlFailed'));
                });
                // Invalidate the anki.ts URL cache so the next request
                // (e.g. the connection check below) uses the new value.
                refreshAnkiUrl();
              }}
              placeholder="http://localhost:8765"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">{t('vocabDeck')}</label>
            <p className="mb-1 text-xs text-muted-foreground">{t('vocabDeckHelp')}</p>
            {ankiConnected && ankiDecks.length > 0 ? (
              <select
                value={ankiDeckName}
                onChange={(e) => localStorage.setItem(SETTINGS_KEYS.ANKI_DECK_NAME, e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
              >
                {ankiDecks.map((deck) => (
                  <option key={deck} value={deck}>
                    {deck}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={ankiDeckName}
                onChange={(e) => localStorage.setItem(SETTINGS_KEYS.ANKI_DECK_NAME, e.target.value)}
                placeholder={t('deckName')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">{t('clozeDeck')}</label>
            <p className="mb-2 text-xs text-muted-foreground">{t('clozeDeckHelp')}</p>
            {ankiConnected && ankiDecks.length > 0 ? (
              <select
                value={ankiClozeDeckName}
                onChange={(e) =>
                  localStorage.setItem(SETTINGS_KEYS.ANKI_CLOZE_DECK_NAME, e.target.value)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
              >
                {ankiDecks.map((deck) => (
                  <option key={deck} value={deck}>
                    {deck}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={ankiClozeDeckName}
                onChange={(e) => {
                  const newVal = e.target.value;

                  localStorage.setItem(SETTINGS_KEYS.ANKI_CLOZE_DECK_NAME, newVal);
                  setAnkiClozeDeckName(newVal);
                }}
                placeholder={t('clozeDeckName')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              {t('defaultCardType')}
            </label>
            <p className="mb-2 text-xs text-muted-foreground">{t('cardTypeHelp')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={(e) => {
                  localStorage.setItem(SETTINGS_KEYS.ANKI_CLOZE_DECK_NAME, 'basic');
                  setDefaultCardType('basic');
                }}
                variant={defaultCardType === 'basic' ? 'default' : 'secondary'}
              >
                {t('basic')}
              </Button>
              <Button
                onClick={(e) => {
                  localStorage.setItem(SETTINGS_KEYS.ANKI_CLOZE_DECK_NAME, 'cloze');
                  setDefaultCardType('cloze');
                }}
                variant={defaultCardType === 'cloze' ? 'default' : 'secondary'}
              >
                {t('cloze')}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
