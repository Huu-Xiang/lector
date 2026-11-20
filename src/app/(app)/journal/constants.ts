export const correctionTypeLabels: Record<string, { labelKey: string; className: string }> = {
  grammar: { labelKey: 'grammar', className: 'bg-[var(--clay-soft)] text-clay ' },
  spelling: {
    labelKey: 'spelling',
    className: 'bg-[color-mix(in_srgb,var(--destructive)_12%,var(--card))] text-destructive',
  },
  word_choice: {
    labelKey: 'wordChoice',
    className: 'bg-[var(--gold-soft)] text-[var(--gold-strong)]',
  },
  word_order: {
    labelKey: 'wordOrder',
    className: 'bg-[var(--primary-soft)] text-primary',
  },
  missing_word: {
    labelKey: 'missingWord',
    className: 'bg-[var(--gold-soft)] text-[var(--gold-strong)] ',
  },
  extra_word: { labelKey: 'extraWord', className: 'bg-muted text-muted-foreground' },
};
