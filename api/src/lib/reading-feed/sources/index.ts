import { GLOBAL_VOICES_EN, GLOBAL_VOICES_FR, GLOBAL_VOICES_ZH } from './global-voices';
import {
  SIMPLE_WIKIPEDIA_EN,
  VIKIDIA_FR,
  WIKIVOYAGE_EN,
  WIKIVOYAGE_FR,
  WIKIVOYAGE_ZH,
} from './mediawiki';
import type { ReadingFeedSource } from '../types';

// VOA Learning English and Wikinews were dropped after live verification:
// VOA stopped publishing new articles after USAGM funding cuts in March 2025,
// and the Wikimedia Foundation put every Wikinews edition into read-only mode
// on 2026-05-04. Neither source produces fresh content any more.
export const READING_FEED_SOURCES: readonly ReadingFeedSource[] = [
  GLOBAL_VOICES_EN,
  GLOBAL_VOICES_FR,
  GLOBAL_VOICES_ZH,
  WIKIVOYAGE_EN,
  WIKIVOYAGE_FR,
  WIKIVOYAGE_ZH,
  SIMPLE_WIKIPEDIA_EN,
  VIKIDIA_FR,
];
