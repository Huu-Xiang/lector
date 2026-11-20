import type { ReviewExampleResult, ReviewItem, SentenceTranslation } from '@/types';

export type CardPatch = Partial<
  Pick<
    ReviewItem,
    | 'sentence'
    | 'sentenceBlank'
    | 'sentenceSource'
    | 'sentenceTranslation'
    | 'example'
    | 'translationPending'
    | 'aiExamplePending'
  >
>;

export interface LazySentenceApi {
  example: (cardId: string) => Promise<ReviewExampleResult>;
  translation: (cardId: string) => Promise<SentenceTranslation | null>;
}

export function applyCardPatch(item: ReviewItem, patch: CardPatch): ReviewItem {
  const next = { ...item, ...patch };
  for (const key of ['translationPending', 'aiExamplePending'] as const) {
    if (patch[key] === undefined && key in patch) delete next[key];
  }
  return next;
}

function translationPatch(item: ReviewItem, translation: SentenceTranslation | null): CardPatch {
  if (!translation) return { translationPending: undefined };
  if (item.example) {
    return { example: { ...item.example, translation }, translationPending: undefined };
  }
  return { sentenceTranslation: translation, translationPending: undefined };
}

async function fetchTranslation(
  item: ReviewItem,
  requested: Set<string>,
  api: LazySentenceApi,
  patch: (patch: CardPatch) => void,
) {
  const key = `${item.cardId}:translation`;
  if (requested.has(key)) return;
  requested.add(key);
  try {
    patch(translationPatch(item, await api.translation(item.cardId)));
  } catch {
    // Keep what is shown.
  }
}

export async function resolveLazySentence(
  item: ReviewItem,
  requested: Set<string>,
  api: LazySentenceApi,
  patch: (patch: CardPatch) => void,
): Promise<void> {
  const exampleKey = `${item.cardId}:example`;
  if (item.aiExamplePending && !requested.has(exampleKey)) {
    requested.add(exampleKey);
    try {
      const { sentence, translationPending } = await api.example(item.cardId);
      if (!sentence) {
        patch({ aiExamplePending: undefined });
      } else {
        const next: CardPatch = {
          sentence: sentence.text,
          sentenceBlank: sentence.blank,
          sentenceSource: sentence.source,
          sentenceTranslation: sentence.translation,
          translationPending: translationPending ? true : undefined,
          aiExamplePending: undefined,
        };
        patch(next);
        if (translationPending) {
          await fetchTranslation(applyCardPatch(item, next), requested, api, patch);
        }
        return;
      }
    } catch {
      return;
    }
  }
  if (item.translationPending) await fetchTranslation(item, requested, api, patch);
}
