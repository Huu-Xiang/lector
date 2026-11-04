// Per-language sentence banks, lazily loaded. Each value is a LITERAL dynamic
// import so the bundler still includes the JSON, but the file is only read when
// that language is actually seeded — no need to load every language's bank up
// front. Add a language by dropping in a sentence-bank-<code>.json and
// registering it here. Rows are stored under the language whose bank we load,
// so seeding can never mislabel one language's sentences as another's.
const SENTENCE_BANKS: Record<string, () => Promise<{ default: unknown }>> = {
  af: () => import('./sentence-bank-af.json'),
  ar: () => import('./sentence-bank-ar.json'),
  bn: () => import('./sentence-bank-bn.json'),
  cs: () => import('./sentence-bank-cs.json'),
  de: () => import('./sentence-bank-de.json'),
  el: () => import('./sentence-bank-el.json'),
  eo: () => import('./sentence-bank-eo.json'),
  es: () => import('./sentence-bank-es.json'),
  fi: () => import('./sentence-bank-fi.json'),
  grc: () => import('./sentence-bank-grc.json'),
  hi: () => import('./sentence-bank-hi.json'),
  hu: () => import('./sentence-bank-hu.json'),
  id: () => import('./sentence-bank-id.json'),
  fr: () => import('./sentence-bank-fr.json'),
  it: () => import('./sentence-bank-it.json'),
  nl: () => import('./sentence-bank-nl.json'),
  pl: () => import('./sentence-bank-pl.json'),
  pt: () => import('./sentence-bank-pt.json'),
  ru: () => import('./sentence-bank-ru.json'),
  nb: () => import('./sentence-bank-nb.json'),
  sv: () => import('./sentence-bank-sv.json'),
  tr: () => import('./sentence-bank-tr.json'),
  uk: () => import('./sentence-bank-uk.json'),
  // The first bank that ships `tokens` (#289 4.3). Mandarin has no whitespace,
  // so the client cannot re-derive the segmentation, and jieba disagrees with
  // the browser's Intl.Segmenter anyway.
  zh: () => import('./sentence-bank-zh.json'),
  // Also ships `tokens`, and segmented by the SAME analyser the reader uses.
  // See api/scripts/build-cloze-ja.ts for why that matters: the Mandarin bank
  // was built with a different segmenter than the reader, and the two disagree.
  ja: () => import('./sentence-bank-ja.json'),
  ko: () => import('./sentence-bank-ko.json'),
  la: () => import('./sentence-bank-la.json'),
};

export interface SentenceBankRow {
  id: number | string;
  text: string;
  translation: string;
  clozeWord: string;
  source?: 'tatoeba' | 'mined';
}

export async function loadSentenceBankRows(lang: string): Promise<SentenceBankRow[]> {
  const loader = SENTENCE_BANKS[lang];
  if (!loader) return [];
  return (await loader()).default as SentenceBankRow[];
}
