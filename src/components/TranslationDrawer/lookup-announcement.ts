type Translate = (
  key: 'lookingUp' | 'lookupFailed' | 'definitionLoaded' | 'noDefinitionFound',
  values: { word: string; error?: string },
) => string;

export function lookupAnnouncement(
  {
    isOpen,
    word,
    isLoading,
    error,
    hasResult,
  }: {
    isOpen: boolean;
    word: string;
    isLoading: boolean;
    error?: string | null;
    hasResult: boolean;
  },
  t: Translate,
): string {
  if (!isOpen || !word) return '';
  if (isLoading) return t('lookingUp', { word });
  if (error) return t('lookupFailed', { word, error });
  if (hasResult) return t('definitionLoaded', { word });
  return t('noDefinitionFound', { word });
}
