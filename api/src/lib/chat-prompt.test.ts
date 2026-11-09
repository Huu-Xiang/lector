import { describe, expect, test } from 'bun:test';
import { getSystemPrompt, withSystemPrompt, type ChatTurn } from './chat-prompt';

const PROMPT = getSystemPrompt('English', 'Simplified Chinese');

function countOf(turns: ChatTurn[], needle: string): number {
  return turns.filter((m) => m.content.includes(needle)).length;
}

describe('getSystemPrompt', () => {
  test('names the languages and asks for an answer in the language of the message', () => {
    expect(PROMPT).toContain('English language tutor');
    expect(PROMPT).toContain('reply in the language of the student');
    expect(PROMPT).toContain('Chinese gets an answer in Chinese');
    expect(PROMPT).toContain('reply in Simplified Chinese');
  });

  test('asks the tutor to admit doubt instead of inventing an origin', () => {
    expect(PROMPT).toContain('slang, a meme');
    expect(PROMPT).toContain('Do not invent an origin');
    expect(PROMPT).toContain('source that you cannot verify');
  });
});

describe('withSystemPrompt', () => {
  test('puts the prompt in the first turn when it is a user turn', () => {
    const out = withSystemPrompt(
      [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'second' },
      ],
      PROMPT,
    );
    expect(out[0].content).toBe(`${PROMPT}\n\nStudent's question: first`);
    expect(out.slice(1).map((m) => m.content)).toEqual(['answer', 'second']);
    expect(countOf(out, PROMPT)).toBe(1);
  });

  test('puts the prompt in the first user turn when the window starts with an assistant turn', () => {
    const out = withSystemPrompt(
      [
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: '哈基米是什么意思' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'and this?' },
      ],
      PROMPT,
    );
    expect(out[0]).toEqual({ role: 'assistant', content: 'old answer' });
    expect(out[1].content).toBe(`${PROMPT}\n\nStudent's question: 哈基米是什么意思`);
    expect(countOf(out, PROMPT)).toBe(1);
    expect(out[3].content).toBe('and this?');
  });

  test('adds nothing when the window has no user turn', () => {
    const out = withSystemPrompt([{ role: 'assistant', content: 'only' }], PROMPT);
    expect(out).toEqual([{ role: 'assistant', content: 'only' }]);
  });
});
