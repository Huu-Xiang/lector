import { describe, expect, it } from 'vitest';
import { lookupAnnouncement } from './lookup-announcement';

const messages = {
  lookingUp: 'Looking up {word}.',
  lookupFailed: 'Lookup failed for {word}. {error}',
  definitionLoaded: 'Definition loaded for {word}.',
  noDefinitionFound: 'No definition found for {word}.',
};
const t = (key: keyof typeof messages, values: { word: string; error?: string }) =>
  messages[key].replace('{word}', values.word).replace('{error}', values.error ?? '');

const base = { isOpen: true, word: 'son', isLoading: false, hasResult: false };

describe('lookupAnnouncement', () => {
  it('announces loading', () => {
    expect(lookupAnnouncement({ ...base, isLoading: true }, t)).toBe('Looking up son.');
  });

  it('announces a loaded definition', () => {
    expect(lookupAnnouncement({ ...base, hasResult: true }, t)).toBe('Definition loaded for son.');
  });

  it('announces lookup failures', () => {
    expect(lookupAnnouncement({ ...base, error: 'Try again.' }, t)).toBe(
      'Lookup failed for son. Try again.',
    );
  });

  it('stays silent while the drawer is closed', () => {
    expect(lookupAnnouncement({ ...base, isOpen: false }, t)).toBe('');
  });
});
