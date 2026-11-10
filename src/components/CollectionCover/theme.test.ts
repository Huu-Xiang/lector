import { describe, expect, it } from 'vitest';
import { COVER_BACKGROUNDS, COVER_FOREGROUND, coverTheme } from './theme';

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('coverTheme', () => {
  it('gives one seed the same colour every time', () => {
    expect(coverTheme('library-en-walden')).toEqual(coverTheme('library-en-walden'));
  });

  it('spreads library ids, which share a prefix, over most colours', () => {
    const slugs = [
      'gullivers-travels',
      'a-christmas-carol',
      'walden',
      'the-happy-prince',
      'alices-adventures-in-wonderland',
      'the-tale-of-peter-rabbit',
      'candide',
      'pride-and-prejudice',
      'the-time-machine',
      'aesops-fables',
      'the-secret-garden',
      'a-study-in-scarlet',
      'anne-of-green-gables',
      'the-call-of-the-wild',
      'just-so-stories',
      'the-prophet',
    ];
    const seen = new Set(slugs.map((slug) => coverTheme(`library-en-${slug}`).background));
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('keeps cover text readable on every colour', () => {
    for (const background of COVER_BACKGROUNDS) {
      expect(contrast(background, COVER_FOREGROUND)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
