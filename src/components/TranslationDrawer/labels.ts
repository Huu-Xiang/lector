// The API writes lemma labels and parts of speech in English; these map them
// to keys under reader.drawer.lemma / reader.drawer.pos.

const LEMMA_LABEL_KEYS: Record<string, string> = {
  'derived from': 'derivedFrom',
  'past participle of': 'pastParticiple',
  'repetition of': 'repetition',
  'abstract noun from': 'abstractNoun',
  'diminutive of': 'diminutive',
  'nominalization of': 'nominalization',
  'adverbial form of': 'adverbial',
  'inflected/plural of': 'formOf',
  'plural of': 'plural',
  'present tense of': 'presentTense',
  'past tense of': 'pastTense',
  'future tense of': 'futureTense',
  'conditional of': 'conditional',
  'imperative of': 'imperative',
  'compound ending in': 'compound',
  'base form of': 'formOf',
};

export type LemmaLabel = { key: string; detail: string | null } | { key: null; raw: string };

/**
 * `detail` is the peeled ending when it is written in the learning language's
 * own script (Korean 이, 을 + 는); Latin grammar tags are dropped.
 */
export function parseLemmaLabel(label: string): LemmaLabel {
  const known = LEMMA_LABEL_KEYS[label];
  if (known) return { key: known, detail: null };
  const form = /^(.*?)\s*form of$/.exec(label);
  if (form) {
    const detail = form[1].trim();
    return { key: 'formOf', detail: detail && !/[A-Za-z]/.test(detail) ? detail : null };
  }
  return { key: null, raw: label };
}

const POS_KEYS = new Set([
  'noun',
  'verb',
  'adj',
  'adv',
  'pron',
  'prep',
  'postp',
  'conj',
  'intj',
  'num',
  'det',
  'article',
  'particle',
  'phrase',
  'name',
  'prefix',
  'suffix',
  'affix',
  'root',
  'counter',
  'proverb',
  'contraction',
  'character',
  'symbol',
  'punct',
  'abbrev',
]);

const POS_ALIASES: Record<string, string> = {
  adjective: 'adj',
  adverb: 'adv',
  pronoun: 'pron',
  preposition: 'prep',
  postposition: 'postp',
  conjunction: 'conj',
  interjection: 'intj',
  numeral: 'num',
  determiner: 'det',
  'proper noun': 'name',
  idiom: 'phrase',
  abbreviation: 'abbrev',
};

export function posKey(pos: string): string | null {
  const lower = pos.trim().toLowerCase();
  const key = POS_ALIASES[lower] ?? lower;
  return POS_KEYS.has(key) ? key : null;
}
