export interface CoverTheme {
  /** Cloth colour of a generated book cover; the band colour of an article. */
  background: string;
  /** Text on `background`; the pair keeps a contrast of at least 4.5:1. */
  foreground: string;
}

export const COVER_FOREGROUND = '#fffdf7';

export const COVER_BACKGROUNDS = [
  '#2f6f62',
  '#34506b',
  '#6b4460',
  '#9a4f37',
  '#6a6230',
  '#4a5560',
  '#7c3a44',
  '#2c6470',
  '#2e3f63',
  '#3d5a3a',
  '#7a4a2a',
  '#523a5e',
] as const;

/** The same seed always gives the same colour, so a book keeps its cover. */
export function coverTheme(seed: string): CoverTheme {
  // FNV-1a, then a shift so that ids with a shared prefix do not land on a few colours.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return {
    background: COVER_BACKGROUNDS[hash % COVER_BACKGROUNDS.length],
    foreground: COVER_FOREGROUND,
  };
}
