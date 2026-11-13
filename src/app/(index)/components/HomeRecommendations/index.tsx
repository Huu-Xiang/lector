'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
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
}: {
  language: string;
  defaultOpen: boolean;
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
    const collapsed = readCollapsed(language);
    setChosen(collapsed === null ? null : !collapsed);
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
    if (!next) setPicking(false);
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
    <section
      className="mb-4 rounded-xl border border-border bg-card px-3 sm:mb-6 sm:px-5"
      data-testid="home-recommend"
    >
      <div className="recommendations-header flex min-h-14 items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{t('homeTitle')}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? t('collapse') : t('expand')}
          title={expanded ? t('collapse') : t('expand')}
          data-testid="home-recommend-toggle"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </Button>
      </div>
      {expanded && (
        <>
          <RecommendedForYou
            language={language}
            level={profile.level}
            interests={profile.interests}
            onStart={open}
            onEmpty={markEmpty}
            compact
          />
          <div className="flex flex-wrap items-center gap-x-3 border-t border-border py-1">
            <Button
              variant="ghost"
              className="min-h-11 px-2 text-muted-foreground"
              onClick={() => setPicking(!picking)}
              aria-expanded={picking}
              data-testid="home-recommend-level"
            >
              {profile.level ? t('changeLevel') : t('setLevel')}
            </Button>
            {language === 'en' && (
              <VocabTestLink
                from="library"
                className="min-h-11 px-2 text-muted-foreground"
                testId="home-vocab-test-link"
              />
            )}
          </div>
          {picking && (
            <div className="pb-3">
              <ReadingLevelPicker
                level={profile.level}
                onPick={pickLevel}
                disabled={saving}
                label={t('levelPickerLabel')}
                testIdPrefix="home-level"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
