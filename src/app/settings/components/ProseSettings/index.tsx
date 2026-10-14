'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import WordCell from '@/components/WordCell';
import { splitWords } from '@/components/MarkdownReader/utils';
import { LANGUAGES, normalizeEnabledLanguages } from '@/lib/languages';
import {
  DEFAULT_PROSE_STYLE,
  PROSE_STYLE_LIMITS,
  hasLanguageOverride,
  inheritedProseStyle,
  proseStyleVars,
  resolveProseStyle,
  withGlobalProseStyle,
  withLanguageProseStyle,
  type ProseStyle,
  type ProseStyleOverride,
} from '@/lib/prose-style';
import type { LanguageCode } from '@/types/language';
import { useActiveLanguage, useEnabledLanguages, useProseStyleSettings } from '@/utils/hooks';
import { writeProseStyleSettings } from '@/utils/prose-style-storage';
import type { WordState } from '@/types';

/** 'global' edits every language. A language code edits that language only. */
type Scope = 'global' | LanguageCode;

const PROSE_FIELDS = Object.keys(DEFAULT_PROSE_STYLE) as (keyof ProseStyle)[];

const CONTROLS: {
  field: keyof ProseStyle;
  step: number;
  format: (value: number) => string;
}[] = [
  { field: 'fontSize', step: 1, format: (value) => `${value}px` },
  { field: 'fontWeight', step: 100, format: (value) => String(value) },
  { field: 'letterSpacing', step: 0.005, format: (value) => `${value.toFixed(3)}em` },
  { field: 'lineHeight', step: 0.05, format: (value) => value.toFixed(2) },
];

/**
 * Reader typography (#570).
 *
 * Two scopes, because one set of numbers cannot serve every script. A reader
 * sets a size and a weight they like once, under "All languages", and then
 * corrects the one language whose script needs different treatment. Japanese is
 * the language that reported the problem: a leading tuned for Latin leaves its
 * lines too far apart.
 *
 * A language with no correction of its own inherits, and the panel says so. It
 * therefore also follows a later change to the global setting, which a copy of
 * the numbers into every language would not.
 */
export default function ProseSettings() {
  const t = useTranslations('settings.prose');
  const activeLang = useActiveLanguage();
  const enabledCodes = useEnabledLanguages();
  const settings = useProseStyleSettings();
  const [scope, setScope] = useState<Scope>('global');

  const languages = useMemo(
    () => normalizeEnabledLanguages([...enabledCodes, activeLang.code]),
    [enabledCodes, activeLang.code],
  );

  // The pack the preview draws with. Under "All languages" that is whatever the
  // reader is studying now, so the sample is in a script they can read.
  const pack = LANGUAGES[scope === 'global' ? activeLang.code : scope];
  const customised = scope !== 'global' && hasLanguageOverride(settings, scope);

  // The layer BELOW the one being edited, which is what an untouched slider
  // shows and what a stored value is measured against.
  //
  // "All languages" sits above the app defaults and nothing else. It must NOT
  // pick up the active language's pack default: the numbers here apply to every
  // language, and seeding them from Japanese would push the Japanese leading
  // onto German the moment any slider moved.
  const baseline: ProseStyle =
    scope === 'global' ? DEFAULT_PROSE_STYLE : inheritedProseStyle(pack, settings);

  /** What the reader has already saved for this scope. */
  const saved: ProseStyle =
    scope === 'global'
      ? { ...DEFAULT_PROSE_STYLE, ...settings.global }
      : resolveProseStyle(pack, settings);

  // Unsaved slider positions, one set per scope. Kept per scope rather than as
  // one value, so a reader who edits Japanese, looks at German and comes back
  // still has their edit. Save writes them; Reset throws them away.
  const [drafts, setDrafts] = useState<Partial<Record<Scope, ProseStyle>>>({});
  const draft = drafts[scope];
  const shown: ProseStyle = draft ?? saved;
  const unsaved = PROSE_FIELDS.some((field) => shown[field] !== saved[field]);

  function setField(field: keyof ProseStyle, value: number) {
    setDrafts((current) => ({ ...current, [scope]: { ...shown, [field]: value } }));
  }

  function clearDraft() {
    setDrafts((current) => {
      const next = { ...current };
      delete next[scope];
      return next;
    });
  }

  /**
   * Save the sliders, keeping only the fields that differ from the layer below.
   *
   * A full copy would work today and go wrong later: a language that stated one
   * corrected leading would also freeze its size and weight, and would then
   * ignore the next change to "All languages". Storing the difference keeps
   * every field the reader did not touch following the layer below it.
   */
  function save() {
    const override: ProseStyleOverride = {};
    for (const field of PROSE_FIELDS) {
      if (shown[field] !== baseline[field]) override[field] = shown[field];
    }
    writeProseStyleSettings(
      scope === 'global'
        ? withGlobalProseStyle(settings, override)
        : withLanguageProseStyle(settings, scope, override),
    );
    clearDraft();
  }

  /** Throw away the unsaved sliders AND whatever this scope had saved. */
  function reset() {
    writeProseStyleSettings(
      scope === 'global'
        ? withGlobalProseStyle(settings, {})
        : withLanguageProseStyle(settings, scope, {}),
    );
    clearDraft();
  }

  return (
    <section className="panel p-6" data-testid="prose-settings">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={scope === 'global' ? 'default' : 'secondary'}
          size="sm"
          data-testid="prose-scope-global"
          onClick={() => setScope('global')}
        >
          {t('allLanguages')}
        </Button>
        {languages.map((code) => (
          <Button
            key={code}
            variant={scope === code ? 'default' : 'secondary'}
            size="sm"
            data-testid={`prose-scope-${code}`}
            onClick={() => setScope(code)}
          >
            <span aria-hidden="true">{LANGUAGES[code].flag}</span>
            {LANGUAGES[code].native}
            {hasLanguageOverride(settings, code) && (
              <span
                aria-label={t('hasOwnSettings')}
                className="ml-1 h-1.5 w-1.5 rounded-full bg-current opacity-70"
              />
            )}
          </Button>
        ))}
      </div>

      {scope !== 'global' && (
        <p className="mb-4 text-xs text-muted-foreground" data-testid="prose-inherits-notice">
          {customised
            ? t('customisedNotice', { language: LANGUAGES[scope].native })
            : t('inheritedNotice', { language: LANGUAGES[scope].native })}
        </p>
      )}

      <ProsePreview pack={pack} style={shown} />

      <div>
        {CONTROLS.map(({ field, step, format }) => (
          <div key={field} className="mt-5">
            <label
              htmlFor={`prose-${field}`}
              className="mb-1 flex items-center justify-between text-sm font-medium text-foreground"
            >
              <span>
                {t(`controls.${field}.label`)}
                {/* A status, never a control. Muted and lower case, because the
                    same note in the accent colour read as a button and people
                    clicked it. */}
                {scope !== 'global' && settings.byLanguage[scope]?.[field] !== undefined && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t('setFor', { language: LANGUAGES[scope].native })}
                  </span>
                )}
              </span>
              <span
                className="font-mono text-muted-foreground"
                data-testid={`prose-${field}-value`}
              >
                {format(shown[field])}
              </span>
            </label>
            <input
              id={`prose-${field}`}
              data-testid={`prose-${field}`}
              type="range"
              min={PROSE_STYLE_LIMITS[field].min}
              max={PROSE_STYLE_LIMITS[field].max}
              step={step}
              value={shown[field]}
              onChange={(event) => setField(field, Number(event.target.value))}
              className="w-full accent-blue-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t(`controls.${field}.hint`)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="sm" data-testid="prose-save" disabled={!unsaved} onClick={save}>
          {t('save')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="prose-reset"
          disabled={
            !unsaved &&
            (scope === 'global' ? Object.keys(settings.global).length === 0 : !customised)
          }
          onClick={reset}
        >
          {scope === 'global'
            ? t('resetDefaults')
            : t('resetLanguage', { language: LANGUAGES[scope].native })}
        </Button>
        <p className="text-xs text-muted-foreground" data-testid="prose-status">
          {unsaved
            ? t('statusUnsaved')
            : scope === 'global'
              ? t('statusDefaults', {
                  fontSize: String(DEFAULT_PROSE_STYLE.fontSize),
                  fontWeight: String(DEFAULT_PROSE_STYLE.fontWeight),
                  lineHeight: String(DEFAULT_PROSE_STYLE.lineHeight),
                })
              : t('statusResetLanguage', { language: LANGUAGES[scope].native })}
        </p>
      </div>
    </section>
  );
}

/**
 * The pack's own test phrase, drawn with the word chips the reader draws, so the
 * weight and the kerning show on the element they apply to. States are assigned
 * by position rather than from the vocabulary: a preview must look the same for
 * every account, and a lookup here would be a request per keystroke.
 */
const PREVIEW_STATES: WordState[] = ['known', 'level2', 'known', 'new', 'level4'];

/**
 * How many times the test phrase is repeated. A phrase is one line at any size
 * the sliders reach, and one line shows no leading at all — the control the
 * issue is really about. Three wraps at every size in the panel's width.
 */
const PREVIEW_REPEATS = 3;

function ProsePreview({
  pack,
  style,
}: {
  pack: (typeof LANGUAGES)[LanguageCode];
  style: ProseStyle;
}) {
  // The word state is picked by position, so the running count has to come out
  // of the split rather than out of a variable the map mutates.
  const parts = useMemo(() => {
    let wordIndex = -1;
    const phrase = Array(PREVIEW_REPEATS).fill(pack.testPhrase).join(' ');
    return splitWords(phrase, pack).map((part) => ({
      ...part,
      state: part.isWord ? PREVIEW_STATES[++wordIndex % PREVIEW_STATES.length] : undefined,
    }));
  }, [pack]);

  return (
    <div
      lang={pack.script.bcp47}
      dir={pack.script.direction}
      data-testid="prose-preview"
      className="rounded-lg border border-border bg-card p-4 text-foreground"
      style={{
        fontFamily: 'var(--font-literata), Georgia, serif',
        fontSize: 'var(--reader-font-size)',
        letterSpacing: 'var(--reader-letter-spacing)',
        lineHeight: 'var(--reader-line-height)',
        ...proseStyleVars(style, pack),
      }}
    >
      {parts.map((part, index) =>
        part.isWord ? (
          <WordCell key={index} text={part.text} state={part.state} testId="prose-preview-word" />
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </div>
  );
}
