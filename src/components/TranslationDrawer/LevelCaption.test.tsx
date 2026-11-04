import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LevelCaption } from './LevelCaption';

function render(locale: 'en' | 'zh-CN') {
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  );
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LevelCaption />
    </NextIntlClientProvider>,
  );
}

describe('LevelCaption', () => {
  it('names the four levels in English', () => {
    expect(render('en')).toContain('1 New · 2 Learning · 3 Familiar · 4 Mastered');
  });

  it('names the four levels in Chinese', () => {
    expect(render('zh-CN')).toContain('1 新 · 2 学习中 · 3 熟悉 · 4 掌握');
  });

  it('uses small muted text', () => {
    const markup = render('en');
    expect(markup).toContain('text-xs');
    expect(markup).toContain('text-muted-foreground');
    expect(markup).toContain('data-testid="word-level-caption"');
  });
});
