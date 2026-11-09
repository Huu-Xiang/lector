import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChatMessageContent from './ChatMessageContent';

const render = (role: 'user' | 'assistant', content: string) =>
  renderToStaticMarkup(<ChatMessageContent role={role} content={content} />);

describe('ChatMessageContent', () => {
  it('renders bold text and lists for an assistant message', () => {
    const html = render('assistant', '**哈基米** 是网络用语。\n\n* 一\n* 二');
    expect(html).toContain('<strong class="font-semibold">哈基米</strong>');
    expect(html).toContain('<ul');
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).not.toContain('**');
    expect(html).not.toContain('* 一');
  });

  it('renders inline code and code blocks', () => {
    const html = render('assistant', 'Use `de` here.\n\n```\nje suis\n```');
    expect(html).toContain('<code');
    expect(html).toContain('<pre');
    expect(html).toContain('je suis');
  });

  it('does not pass raw HTML through', () => {
    const html = render(
      'assistant',
      'hi <img src="x" onerror="alert(1)"> <script>alert(1)</script>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('opens links safely in a new tab and drops script links', () => {
    const html = render('assistant', '[site](https://example.com) [bad](javascript:alert(1))');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('javascript:');
  });

  it('survives a partial message', () => {
    const html = render('assistant', '**half bold and `half code\n\n* item\n```\nunclosed');
    expect(html).toContain('data-testid="chat-markdown"');
    expect(html).toContain('unclosed');
  });

  it('keeps a user message as plain text with whitespace preserved', () => {
    const html = render('user', '**not bold**\n* not a list');
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('**not bold**\n* not a list');
    expect(html).not.toContain('<strong');
    expect(html).not.toContain('<li');
  });
});
