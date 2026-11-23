import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { LANGUAGES } from '@/lib/languages';
import { DEFAULT_PROSE_STYLE } from '@/lib/prose-style';
import TranscriptReader from './TranscriptReader';

const en = LANGUAGES.en;

describe('TranscriptReader', () => {
  it('marks timestamp buttons with select-none alongside cue text', () => {
    const html = renderToStaticMarkup(
      <TranscriptReader
        segments={[
          { start: 0, end: 3, text: 'Hello world' },
          { start: 3, end: 6, text: 'good morning' },
        ]}
        sourceUrl="https://www.youtube.com/watch?v=test123"
        pack={en}
        prose={DEFAULT_PROSE_STYLE}
        segmentation={null}
        knownWordsMap={new Map()}
        readings={null}
        annotationMode="off"
        highlightedPhrase={[]}
        activeWord={null}
        activeSegmentIndex={null}
        onWordClick={vi.fn()}
        onActivateWord={vi.fn()}
        onClearPhrase={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    const timestampButtons = html.match(/<button[^>]*data-testid="transcript-timestamp"[^>]*>/g);
    expect(timestampButtons).toHaveLength(2);
    for (const buttonTag of timestampButtons ?? []) {
      expect(buttonTag).toMatch(/class="[^"]*\bselect-none\b[^"]*"/);
    }
    expect(html).toContain('0:00');
    expect(html).toContain('0:03');
    expect(html).toContain('Hello');
    expect(html).toContain('world');
    expect(html).toContain('good');
    expect(html).toContain('morning');
  });
});
