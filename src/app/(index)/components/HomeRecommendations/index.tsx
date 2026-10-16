'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RecommendedForYou from '@/components/RecommendedForYou';
import { getLessonsForCollection, getSetting } from '@/lib/data-layer';
import { getReadingLevel, type CefrLevel } from '@/lib/reading-level';

const COLLAPSED_KEY = 'readfox-home-recommend-collapsed';

function readCollapsed(language: string): boolean | null {
  try {
    const value = localStorage.getItem(`${COLLAPSED_KEY}-${language}`);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
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
  const [profile, setProfile] = useState<{ level: CefrLevel | null; interests: string[] } | null>(
    null,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only */
    setChosen(readCollapsed(language) === null ? null : !readCollapsed(language));
    Promise.all([
      getReadingLevel(language),
      getSetting<string[]>('readingInterests').catch(() => undefined),
    ]).then(([level, interests]) => {
      if (!cancelled) setProfile({ level, interests: interests ?? [] });
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

  if (profile === null) return null;

  return (
    <section className="panel mb-8 p-5" data-testid="home-recommend">
      <div className={`flex items-start justify-between gap-3 ${expanded ? 'mb-4' : ''}`}>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('homeTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.level ? t('homeHintLevel', { level: profile.level }) : t('homeHint')}
          </p>
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
      {expanded && (
        <RecommendedForYou
          language={language}
          level={profile.level}
          interests={profile.interests}
          onStart={open}
        />
      )}
    </section>
  );
}
