import { db } from '../../db';
import { isRetiringState, syncWordState, type WordStateSource } from './sync-word-state';
import { newestVocabByKey } from './word-card-rows';

export function insertMissingWordCards(
  userId: string,
  language: string,
  source: WordStateSource,
  now = Date.now(),
): void {
  const hasCard = new Set(
    (
      db
        .prepare('SELECT wordKey FROM wordCards WHERE userId = ? AND language = ?')
        .all(userId, language) as Array<{ wordKey: string }>
    ).map((row) => row.wordKey),
  );
  for (const [wordKey, vocab] of newestVocabByKey(userId, language)) {
    if (hasCard.has(wordKey) || isRetiringState(vocab.state)) continue;
    syncWordState({
      userId,
      language,
      wordKey,
      state: vocab.state,
      source,
      newest: vocab,
      keepRows: true,
      now,
    });
  }
}

export function reconcileWordCards(userId: string, language: string, now = Date.now()): void {
  db.transaction(() => {
    const newest = newestVocabByKey(userId, language);
    const cards = db
      .prepare('SELECT id, wordKey, lastSyncedAt FROM wordCards WHERE userId = ? AND language = ?')
      .all(userId, language) as Array<{ id: string; wordKey: string; lastSyncedAt: string | null }>;

    for (const card of cards) {
      const vocab = newest.get(card.wordKey);
      if (!vocab) {
        db.prepare('DELETE FROM wordCards WHERE userId = ? AND id = ?').run(userId, card.id);
        continue;
      }
      const synced = card.lastSyncedAt === null ? 0 : Date.parse(card.lastSyncedAt);
      if (Date.parse(vocab.stateUpdatedAt) > synced) {
        syncWordState({
          userId,
          language,
          wordKey: card.wordKey,
          state: vocab.state,
          source: 'reader',
          newest: vocab,
          keepRows: true,
          now,
        });
      }
    }

    insertMissingWordCards(userId, language, 'reader', now);
  })();
}
