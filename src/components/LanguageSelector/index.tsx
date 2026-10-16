'use client';

import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getFluencyStats, seedStarterContent, setSetting } from '@/lib/data-layer';
import { availableLanguages, LANGUAGES, normalizeEnabledLanguages } from '@/lib/languages';
import { LanguageCode } from '@/types/language';
import { languageDisplayName } from '@/lib/language-names';
import { isLanguageReady, parseReadyLanguages } from '@/lib/ready-languages';
import { useReadyLanguagesSetting } from '@/lib/use-env';
import { useActiveLanguage, useEnabledLanguages, useLanguageResolved } from '@/utils/hooks';
import { setLanguageInStorage } from '@/utils/storage';
import { toast } from 'sonner';

function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export default function LanguageSelector({
  compact = false,
  collapsed = false,
}: {
  compact?: boolean;
  collapsed?: boolean;
}) {
  const t = useTranslations('chrome.language');
  const locale = useLocale();
  const ready = parseReadyLanguages(useReadyLanguagesSetting());
  const activeLang = useActiveLanguage();
  const resolved = useLanguageResolved();
  const enabledCodes = useEnabledLanguages();
  const [knownWordsCount, setKnownWordsCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Pass the selected language explicitly. The badge belongs to this
        // selector state; relying on the ambient cache can show the previous
        // language's count while a cloud language change is propagating.
        const fluency = await getFluencyStats(activeLang.code);

        if (!cancelled) setKnownWordsCount(fluency.totalKnownWords);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [activeLang.code]);

  async function handleSwitch(code: LanguageCode) {
    try {
      // The API opts the account into whatever language it switches to (#442),
      // so adding a language and switching to one are the same write.
      await setSetting('targetLanguage', code);
      setLanguageInStorage(code);
      // First-ever switch to a language seeds its starter content before the
      // reload lands wherever the user was; never throws (#315).
      await seedStarterContent(code);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('changeFailed'));
    }
  }

  const knownBadge = knownWordsCount ? (
    <span
      title={t('wordsKnown', { count: knownWordsCount })}
      className="rounded-full border border-[var(--gold-lip)] bg-[var(--gold-soft)] px-1 py-px text-[var(--gold-strong)] sm:px-2 sm:py-1"
    >
      {knownWordsCount > 1000 ? `${(knownWordsCount / 1000).toFixed(1)}K` : knownWordsCount}
    </span>
  ) : null;

  // The active language is always listed, whatever the stored list says.
  const listed = normalizeEnabledLanguages([...enabledCodes, activeLang.code]);
  const addable = availableLanguages(listed);

  function languageRow(code: LanguageCode, testIdPrefix: string, markActive: boolean) {
    const isActive = markActive && code === activeLang.code;
    const inDevelopment = !markActive && !isLanguageReady(code, ready);
    const localized = languageDisplayName(code, locale, LANGUAGES[code].name);
    return (
      <DropdownMenuItem
        key={code}
        onClick={() => handleSwitch(code)}
        disabled={inDevelopment}
        data-testid={`${testIdPrefix}-${code}`}
        className={isActive ? 'font-medium' : undefined}
      >
        <span className="text-lg">{LANGUAGES[code].flag}</span>
        <span>{LANGUAGES[code].native}</span>
        {localized !== LANGUAGES[code].native && (
          <span className="text-xs text-muted-foreground">{localized}</span>
        )}
        {inDevelopment && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('inDevelopment')}
          </span>
        )}
        {isActive && <Check className="ml-auto size-4" />}
      </DropdownMenuItem>
    );
  }

  const needle = foldForSearch(query);
  const searching = needle.length > 0;
  const matches = searching
    ? [...listed, ...addable].filter((code) => {
        const lang = LANGUAGES[code];
        return [lang.native, lang.name, languageDisplayName(code, locale, lang.name), code].some(
          (label) => foldForSearch(label).includes(needle),
        );
      })
    : [];
  const searchItems = matches.map((code) =>
    listed.includes(code)
      ? languageRow(code, 'language-option', true)
      : languageRow(code, 'language-add-option', false),
  );

  const menuItems = listed.map((code) => languageRow(code, 'language-option', true));
  const addItems = addOpen
    ? addable.map((code) => languageRow(code, 'language-add-option', false))
    : null;

  const addSection =
    addable.length > 0 ? (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setAddOpen((wasOpen) => !wasOpen)}
          data-testid="language-add-toggle"
          aria-expanded={addOpen}
          className="text-muted-foreground"
        >
          <Plus className="size-4" />
          <span>{t('add')}</span>
        </DropdownMenuItem>
        {addItems}
      </>
    ) : null;

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAddOpen(false);
      setQuery('');
    }
  }

  const searchBox = (
    <div className="sticky top-0 z-10 -mx-1 -mt-1 flex items-center gap-2 border-b border-border bg-popover px-3 py-2">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (!['Escape', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation();
        }}
        placeholder={t('search')}
        aria-label={t('search')}
        data-testid="language-search"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );

  const variant = collapsed ? 'collapsed' : compact ? 'compact' : 'full';
  const triggerClass = {
    collapsed:
      'flex items-center justify-center rounded-lg p-2 text-lg transition-colors hover:bg-accent',
    compact:
      'flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted',
    full: 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent',
  }[variant];

  const menu = (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        data-testid="language-selector"
        aria-label={t('current', { language: activeLang.native })}
        title={variant === 'collapsed' ? activeLang.native : undefined}
        className={triggerClass}
      >
        <span className={variant === 'full' ? 'text-lg' : undefined}>{activeLang.flag}</span>
        {variant === 'compact' && <span>{activeLang.code.toUpperCase()}</span>}
        {variant === 'full' && <span className="flex-1 text-left">{activeLang.native}</span>}
        {variant !== 'collapsed' && knownBadge}
        {variant !== 'collapsed' && <ChevronDown className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'compact' ? 'end' : 'start'}
        aria-label={t('select')}
        className={`${variant === 'compact' ? 'w-44' : 'min-w-44'} max-h-80 overflow-y-auto`}
      >
        {searchBox}
        {searching ? (
          searchItems.length > 0 ? (
            searchItems
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t('noMatch')}</div>
          )
        ) : (
          <>
            {menuItems}
            {addSection}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!resolved) {
    const placeholder = (
      <div
        aria-hidden
        data-testid="language-selector-loading"
        className={`${triggerClass} animate-pulse`}
      >
        <span className="size-5 rounded-full bg-muted" />
        {variant === 'full' && <span className="h-4 flex-1 rounded bg-muted" />}
      </div>
    );
    if (variant === 'collapsed')
      return <div className="flex justify-center px-1">{placeholder}</div>;
    if (variant === 'full') return <div className="mx-3">{placeholder}</div>;
    return placeholder;
  }

  if (variant === 'collapsed') {
    return <div className="flex justify-center px-1">{menu}</div>;
  }
  if (variant === 'full') {
    return <div className="mx-3">{menu}</div>;
  }
  return menu;
}
