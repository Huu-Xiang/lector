import { describe, expect, it, vi } from 'vitest';
import type { ReviewItem, SentenceBlank } from '@/types';
import { applyCardPatch, resolveLazySentence, type CardPatch } from '../lazy-sentence';
import { blankSentence, effectiveQuestionType, renderBlank } from '../questions';
import { buildSourceLine } from '../sentence-source';
import { createInitialWordRound, wordRoundReducer } from '../use-word-review-round';

function item(word: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    cardId: `card-${word}`,
    word,
    type: 'word',
    stage: 'familiar',
    questionType: 'fill_in',
    sentence: `I saw the ${word} yesterday.`,
    translation: `meaning of ${word}`,
    ...over,
  };
}

const blank = (sentence: string, text: string): SentenceBlank => {
  const start = sentence.indexOf(text);
  return { tokenStart: 0, tokenEnd: 1, start, end: start + text.length };
};

describe('source line', () => {
  it('links a library sentence to its book page with book and chapter', () => {
    expect(
      buildSourceLine(
        {
          kind: 'library',
          bookSlug: 'the-harbor',
          bookTitle: 'The Harbor',
          chapterTitle: 'Chapter 2',
        },
        'en',
      ),
    ).toEqual({
      kind: 'library',
      book: 'The Harbor',
      chapter: 'Chapter 2',
      href: '/books/en/the-harbor',
    });
  });

  it('keeps a library source without a chapter or slug', () => {
    expect(
      buildSourceLine(
        { kind: 'library', bookTitle: 'A Christmas Carol', bookTitles: { 'zh-CN': '圣诞颂歌' } },
        'en',
        'zh-CN',
      ),
    ).toMatchObject({ kind: 'library', book: '圣诞颂歌' });
    expect(buildSourceLine({ kind: 'library', bookTitle: 'The Harbor' }, 'fr')).toEqual({
      kind: 'library',
      book: 'The Harbor',
      chapter: null,
      href: null,
    });
    expect(buildSourceLine({ kind: 'library' }, 'fr')).toBeNull();
  });

  it('links a Tatoeba sentence by id', () => {
    expect(buildSourceLine({ kind: 'tatoeba', tatoebaId: 1234 }, 'en')).toEqual({
      kind: 'tatoeba',
      href: 'https://tatoeba.org/en/sentences/show/1234',
    });
  });

  it('links a Tatoeba sentence without id to a search for its text', () => {
    expect(
      buildSourceLine({ kind: 'tatoeba', tatoebaSearchText: 'Is it 5 o’clock & late?' }, 'en'),
    ).toEqual({
      kind: 'tatoeba',
      href: `https://tatoeba.org/en/sentences/search?query=${encodeURIComponent('Is it 5 o’clock & late?')}`,
    });
    expect(buildSourceLine({ kind: 'tatoeba' }, 'en')).toEqual({ kind: 'tatoeba', href: null });
  });

  it('labels an AI sentence and shows nothing for a saved one', () => {
    expect(buildSourceLine({ kind: 'ai' }, 'en')).toEqual({ kind: 'ai' });
    expect(buildSourceLine({ kind: 'saved' }, 'en')).toBeNull();
    expect(buildSourceLine(undefined, 'en')).toBeNull();
  });
});

describe('blank rendering', () => {
  it('blanks the span the server marked', () => {
    const s = 'The harbor was calm.';
    expect(renderBlank(s, blank(s, 'harbor'))).toBe('The _____ was calm.');
  });

  it('keeps trailing punctuation outside the blank', () => {
    const s = 'We reached the harbor.';
    expect(renderBlank(s, blank(s, 'harbor.'))).toBe('We reached the _____.');
    expect(renderBlank(s, blank(s, 'harbor'))).toBe('We reached the _____.');
  });

  it('keeps leading quotes outside the blank', () => {
    const s = 'He said “harbor!” twice.';
    expect(renderBlank(s, blank(s, '“harbor!”'))).toBe('He said “_____!” twice.');
  });

  it('rejects a blank outside the sentence', () => {
    expect(renderBlank('Short.', { tokenStart: 0, tokenEnd: 1, start: 3, end: 40 })).toBeNull();
    expect(renderBlank('Short.', undefined)).toBeNull();
  });

  it('uses the server blank, and falls back to the old blanking without one', () => {
    const s = 'The harbor was calm.';
    expect(blankSentence(item('harbor', { sentence: s, sentenceBlank: blank(s, 'calm') }))).toBe(
      'The harbor was _____.',
    );
    expect(blankSentence(item('harbor', { sentence: s }))).toBe('The _____ was calm.');
  });

  it('keeps a card with a server blank as a fill-in type, even if the word is inflected', () => {
    const s = 'The harbors were calm.';
    const withBlank = item('harbor', {
      sentence: s,
      sentenceBlank: blank(s, 'harbors'),
      questionType: 'typed_fill_in',
    });
    expect(effectiveQuestionType(withBlank, [])).toBe('typed_fill_in');
    expect(effectiveQuestionType({ ...withBlank, sentenceBlank: undefined }, [])).toBe(
      'recognition',
    );
  });
});

describe('lazy sentence calls', () => {
  const translation = { text: 'Le port', lang: 'fr' };

  function setup(card: ReviewItem) {
    const requested = new Set<string>();
    const patches: CardPatch[] = [];
    const api = {
      example: vi.fn(),
      translation: vi.fn().mockResolvedValue(translation),
    };
    const run = (current = card) =>
      resolveLazySentence(current, requested, api, (p) => patches.push(p));
    return { api, patches, run };
  }

  it('fetches a pending translation once per card', async () => {
    const { api, patches, run } = setup(item('harbor', { translationPending: true }));
    await run();
    await run();
    expect(api.translation).toHaveBeenCalledTimes(1);
    expect(patches).toEqual([{ sentenceTranslation: translation, translationPending: undefined }]);
  });

  it('does nothing for a card with nothing pending', async () => {
    const { api, run } = setup(item('harbor'));
    await run();
    expect(api.example).not.toHaveBeenCalled();
    expect(api.translation).not.toHaveBeenCalled();
  });

  it('replaces the saved sentence with an AI example, then fetches its translation', async () => {
    const { api, patches, run } = setup(item('harbor', { aiExamplePending: true }));
    const s = 'A quiet harbor.';
    api.example.mockResolvedValue({
      sentence: { text: s, blank: blank(s, 'harbor.'), source: { kind: 'ai' } },
      translationPending: true,
    });
    await run();
    await run();
    expect(api.example).toHaveBeenCalledTimes(1);
    expect(api.translation).toHaveBeenCalledTimes(1);
    expect(patches[0]).toMatchObject({ sentence: s, sentenceSource: { kind: 'ai' } });
    expect(patches[1]).toEqual({ sentenceTranslation: translation, translationPending: undefined });
  });

  it('keeps the saved sentence when no example comes back', async () => {
    const { api, patches, run } = setup(item('harbor', { aiExamplePending: true }));
    api.example.mockResolvedValue({ sentence: null });
    await run();
    expect(patches).toEqual([{ aiExamplePending: undefined }]);
    expect(api.translation).not.toHaveBeenCalled();
  });

  it('stays silent when a call fails and does not retry', async () => {
    const { api, patches, run } = setup(item('harbor', { translationPending: true }));
    api.translation.mockRejectedValue(new Error('offline'));
    await expect(run()).resolves.toBeUndefined();
    await run();
    expect(api.translation).toHaveBeenCalledTimes(1);
    expect(patches).toEqual([]);
  });

  it('puts a recognition translation on the example sentence', async () => {
    const example = { text: 'The harbor.', source: { kind: 'library' as const } };
    const { patches, run } = setup(item('harbor', { example, translationPending: true }));
    await run();
    expect(patches).toEqual([
      { example: { ...example, translation }, translationPending: undefined },
    ]);
  });

  it('drops the pending flags when a patch clears them', () => {
    const next = applyCardPatch(item('harbor', { translationPending: true }), {
      translationPending: undefined,
    });
    expect('translationPending' in next).toBe(false);
  });
});

describe('card patch reducer', () => {
  it('updates the card in the queue, retry queue and item map only', () => {
    const a = item('harbor', { translationPending: true });
    const b = item('anchor');
    let state = wordRoundReducer(createInitialWordRound(), {
      type: 'loaded',
      roundId: 'r1',
      items: [a, b],
    });
    state = wordRoundReducer(state, {
      type: 'card-patched',
      cardId: a.cardId,
      patch: {
        sentenceTranslation: { text: 'Le port', lang: 'fr' },
        translationPending: undefined,
      },
    });
    expect(state.queue[0].sentenceTranslation?.text).toBe('Le port');
    expect(state.queue[0].translationPending).toBeUndefined();
    expect(state.items[a.cardId].sentenceTranslation?.text).toBe('Le port');
    expect(state.queue[1]).toBe(b);
  });
});
