'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RecommendedForYou from '@/components/RecommendedForYou';
import ReadingLevelPicker, { VocabTestLink } from '@/components/ReadingLevelPicker';
import { getLessonsForCollection, getSettingCached, peekSettingCached } from '@/lib/data-layer';
import { levelFor, setReadingLevel, type CefrLevel } from '@/lib/reading-level';

const COLLAPSED_KEY = 'readfox-home-recommend-collapsed';

function readCollapsed(language: string): boolean | null {
  try {
    const value = localStorage.getItem(`${COLLAPSED_KEY}-${language}`);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

type Profile = { level: CefrLevel | null; interests: string[] };

function profileFrom(
  language: string,
  levels: Record<string, string> | undefined,
  interests: string[] | undefined,
): Profile {
  return { level: levelFor(levels, language), interests: interests ?? [] };
}

function rememberedProfile(language: string): Profile | null {
  const levels = peekSettingCached<Record<string, string>>('readingLevels');
  const interests = peekSettingCached<string[]>('readingInterests');
  if (levels === undefined && interests === undefined) return null;
  return profileFrom(language, levels, interests);
}

/** Always shown; the reader can fold it. It starts open for a small library. */
export default function HomeRecommendations({
  language,
  defaultOpen,
  onMore,
}: {
  language: string;
  defaultOpen: boolean;
  onMore: () => void;
}) {
  const t = useTranslations('recommend');
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(() => rememberedProfile(language));
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [empty, setEmpty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const markEmpty = useCallback(() => setEmpty(true), []);

  async function pickLevel(level: CefrLevel) {
    setSaving(true);
    try {
      await setReadingLevel(language, level);
      setProfile((current) => (current ? { ...current, level } : current));
      setPicking(false);
      setChosen(true);
    } catch {
      toast.error(t('levelSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only */
    setChosen(readCollapsed(language) === null ? null : !readCollapsed(language));
    setEmpty(false);
    Promise.all([
      getSettingCached<Record<string, string>>('readingLevels').catch(() => undefined),
      getSettingCached<string[]>('readingInterests').catch(() => undefined),
    ]).then(([levels, interests]) => {
      if (!cancelled) setProfile(profileFrom(language, levels, interests));
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const expanded = chosen ?? defaultOpen;

  function toggle() {
    const next = !expanded;
    setChosen(next);
    try {
      localStorage.setItem(`${COLLAPSED_KEY}-${language}`, next ? '0' : '1');
    } catch {
      // the choice then lasts until reload
    }
  }

  async function open(collectionId: string) {
    const lessons = await getLessonsForCollection(collectionId);
    router.push(lessons[0] ? `/read/${lessons[0].id}` : '/');
  }

  if (profile === null || empty) return null;

  return (
    <section className="panel mb-4 p-3 sm:mb-8 sm:p-5" data-testid="home-recommend">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 sm:items-start ${expanded ? 'mb-4' : ''}`}
      >
        <div className="min-w-48 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('homeTitle')}
          </h2>
          <p className={`mt-1 text-sm text-muted-foreground ${expanded ? '' : 'max-sm:hidden'}`}>
            {profile.level ? t('homeHintLevel', { level: profile.level }) : t('homeHint')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => setPicking(!picking)}
              aria-expanded={picking}
              data-testid="home-recommend-level"
              className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
            >
              {profile.level ? t('changeLevel') : t('setLevel')}
            </button>
            {language === 'en' && <VocabTestLink from="library" testId="home-vocab-test-link" />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {expanded && (
            <Button variant="outline" size="sm" onClick={onMore} data-testid="home-recommend-more">
              {t('more')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? t('collapse') : t('expand')}
            title={expanded ? t('collapse') : t('expand')}
            data-testid="home-recommend-toggle"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
            />
          </Button>
        </div>
      </div>
      {picking && (
        <div className={expanded ? 'mb-4' : 'mt-3'}>
          <ReadingLevelPicker
            level={profile.level}
            onPick={pickLevel}
            disabled={saving}
            label={t('levelPickerLabel')}
            testIdPrefix="home-level"
          />
        </div>
      )}
      {expanded && (
        <RecommendedForYou
          language={language}
          level={profile.level}
          interests={profile.interests}
          onStart={open}
          onEmpty={markEmpty}
        />
      )}
    </section>
  );
}
