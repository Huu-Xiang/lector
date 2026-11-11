import { describe, expect, test } from 'bun:test';
import { JsonTextExtractor } from './json-text-stream';

function run(chunks: string[], keys: string[]): string {
  const extractor = new JsonTextExtractor(new Set(keys));
  return chunks.map((chunk) => extractor.push(chunk)).join('');
}

describe('JsonTextExtractor', () => {
  test('emits the translation value and ignores other fields', () => {
    const json = '{"translation": "Hello there", "usageNotes": "Informal"}';
    expect(run([json], ['translation'])).toBe('Hello there');
  });

  test('gives the same text for every chunk split', () => {
    const json = '{"translation": "Caf\\u00e9 \\"bon\\"\\nok", "register": "neutral"}';
    const expected = 'Café "bon"\nok';
    for (let cut = 1; cut < json.length; cut += 1) {
      expect(run([json.slice(0, cut), json.slice(cut)], ['translation'])).toBe(expected);
    }
    expect(run(json.split(''), ['translation'])).toBe(expected);
  });

  test('joins gloss values of several senses with a separator', () => {
    const json =
      '{"word":"bank","senses":[{"partOfSpeech":"noun","gloss":"bank"},{"partOfSpeech":"noun","gloss":"shore"}],"ipa":"x"}';
    expect(run([json], ['gloss'])).toBe('bank; shore');
  });

  test('does not emit a key as text or a value of another key', () => {
    const json = '{"translation": "a", "other": {"translation": "b"}, "note": "translation"}';
    expect(run([json], ['translation'])).toBe('a; b');
  });

  test('ignores text before the root object and code fences', () => {
    const json = '```json\n{"translation": "ok"}\n```';
    expect(run([json], ['translation'])).toBe('ok');
  });

  test('emits the part of a value that arrived before the stream was cut', () => {
    expect(run(['{"translation": "Half a sen'], ['translation'])).toBe('Half a sen');
  });
});
