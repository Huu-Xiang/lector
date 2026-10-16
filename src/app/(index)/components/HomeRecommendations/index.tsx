'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RecommendedForYou from '@/components/RecommendedForYou';
import { getLessonsForCollection, getSetting } from '@/lib/data-layer';
import { getReadingLevel, type CefrLevel } from '@/lib/reading-level';

const DISMISSED_KEY = 'readfox-home-recommend-dismissed';

function readDismissed(language: string): boolean {
  try {
    return localStorage.getItem(`${DISMISSED_KEY}-${language}`) === '1';
  } catch {
    return false;
  }
}

export default function HomeRecommendations({
  language,
  onMore,
}: {
  language: string;
  onMore: () => void;
}) {
  const t = useTranslations('recommend');
  const router = useRouter();
  const [profile, setProfile] = useState<{ level: CefrLevel | null; interests: string[] } | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only */
    setDismissed(readDismissed(language));
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

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(`${DISMISSED_KEY}-${language}`, '1');
    } catch {
      // the section simply returns on the next visit
    }
  }

  async function open(collectionId: string) {
    const lessons = await getLessonsForCollection(collectionId);
    router.push(lessons[0] ? `/read/${lessons[0].id}` : '/');
  }

  if (dismissed || profile === null) return null;

  return (
    <section className="panel mb-8 p-5" data-testid="home-recommend">
      <div className="mb-4 flex items-start justify-between gap-3">
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
          <Button variant="outline" size="sm" onClick={onMore} data-testid="home-recommend-more">
            {t('more')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label={t('dismiss')}
            data-testid="home-recommend-dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <RecommendedForYou
        language={language}
        level={profile.level}
        interests={profile.interests}
        onStart={open}
      />
    </section>
  );
}
