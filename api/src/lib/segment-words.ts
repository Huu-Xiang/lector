import { knownWordChecker } from './dictionary-db';
import { buildSegmentWords } from './html-to-markdown';
import type { LanguageConfig } from './languages';

/** A lesson's stored segmentation, cut to words the installed dictionary can define. */
export function segmentWordsFor(text: string, pack: LanguageConfig): string | null {
  if (pack.script.kind !== 'cjk-unspaced') return null;
  return buildSegmentWords(text, pack, knownWordChecker(pack.code));
}
