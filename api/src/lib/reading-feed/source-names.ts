/** Shown names of the feed sources, by source id. */
export const SOURCE_NAMES: Record<string, string> = {
  'global-voices': 'Global Voices',
  wikivoyage: 'Wikivoyage',
  'simple-wikipedia': 'Simple English Wikipedia',
  vikidia: 'Vikidia',
};

export const sourceName = (id: string): string => SOURCE_NAMES[id] ?? id;
