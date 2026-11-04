import { db } from '../../db';
import {
  seedFromLegacy,
  seedFromReaderLevel,
  type LegacyClozeProgress,
  type ReviewCard,
} from './scheduler';
import { isRetiringState } from './sync-word-state';
import { insertWordCard, newestVocabByKey } from './word-card-rows';

const DAY_MS = 86_400_000;
const SEEDED_DUE_PER_DAY = 20;

interface OnboardingRow extends LegacyClozeProgress {
  id: string;
  vocabEntryId: string;
}

function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/**
 * Adds a card for every eligible saved word that has none, so a second run adds nothing.
 * Seeded Review cards are pushed to later UTC days until each day holds at most 20.
 */
export function backfillWordCards(userId: string, language: string, now = Date.now()): number {
  return db.transaction(() => {
    const existing = db
      .prepare('SELECT wordKey, state, due FROM wordCards WHERE userId = ? AND language = ?')
      .all(userId, language) as Array<{ wordKey: string; state: string; due: string }>;
    const hasCard = new Set(existing.map((row) => row.wordKey));
    const perDay = new Map<number, number>();
    for (const row of existing) {
      if (row.state !== 'review') continue;
      const day = dayOf(Date.parse(row.due));
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }

    const onboarding = new Map<string, OnboardingRow>();
    const onboardingRows = db
      .prepare(
        `SELECT id, vocabEntryId, masteryLevel, reviewCount, timesCorrect, timesIncorrect,
                lastReviewed, nextReview
         FROM clozeSentences
         WHERE userId = ? AND language = ? AND source = 'mined' AND collection = 'mined'
           AND id LIKE 'onboarding:%' AND (blacklisted = 0 OR blacklisted IS NULL)`,
      )
      .all(userId, language) as OnboardingRow[];
    for (const row of onboardingRows) onboarding.set(row.vocabEntryId, row);

    const additions: Array<{
      wordKey: string;
      vocabId: string;
      type: 'word' | 'phrase';
      card: ReviewCard;
      mined: string | null;
    }> = [];
    for (const [wordKey, vocab] of newestVocabByKey(userId, language)) {
      if (hasCard.has(wordKey) || isRetiringState(vocab.state)) continue;
      const legacy = onboarding.get(vocab.id);
      additions.push({
        wordKey,
        vocabId: vocab.id,
        type: vocab.type,
        card: legacy
          ? seedFromLegacy(legacy, now)
          : seedFromReaderLevel(
              vocab.state as 'new' | 'level1' | 'level2' | 'level3' | 'level4',
              now,
            ),
        mined: legacy ? legacy.id : null,
      });
    }

    const today = dayOf(now);
    const seeded = additions
      .filter((add) => add.card.state === 'review')
      .sort((a, b) => a.card.due - b.card.due || (a.wordKey < b.wordKey ? -1 : 1));
    for (const add of seeded) {
      const natural = dayOf(add.card.due);
      let day = Math.max(natural, today);
      while ((perDay.get(day) ?? 0) >= SEEDED_DUE_PER_DAY) day++;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      if (day !== natural) add.card = { ...add.card, due: add.card.due + (day - natural) * DAY_MS };
    }

    const blacklist = db.prepare(
      'UPDATE clozeSentences SET blacklisted = 1 WHERE userId = ? AND id = ?',
    );
    for (const add of additions) {
      insertWordCard({ userId, language, ...add, now });
      if (add.mined) blacklist.run(userId, add.mined);
    }
    return additions.length;
  })();
}
