import { describe, expect, it } from 'vitest';
import { readTranslateStream } from './translate-stream';

function bodyOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

describe('readTranslateStream', () => {
  it('reports cumulative text per delta and returns the result', async () => {
    const seen: string[] = [];
    const result = await readTranslateStream<{ translation: string }>(
      bodyOf(['{"delta":"good "}\n{"delta":"day"}\n', '{"result":{"translation":"good day"}}\n']),
      (text) => seen.push(text),
    );
    expect(seen).toEqual(['good ', 'good day']);
    expect(result).toEqual({ translation: 'good day' });
  });

  it('joins a line that arrives in pieces, even inside a multi-byte character', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"delta":"你好"}\n{"result":1}\n');
    const cut = 13;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const seen: string[] = [];
    expect(await readTranslateStream<number>(body, (text) => seen.push(text))).toBe(1);
    expect(seen).toEqual(['你好']);
  });

  it('reads a last line that has no newline', async () => {
    expect(await readTranslateStream<number>(bodyOf(['{"result":7}']), () => {})).toBe(7);
  });

  it('throws the server error line', async () => {
    await expect(
      readTranslateStream(bodyOf(['{"delta":"a"}\n{"error":"content_filtered"}\n']), () => {}),
    ).rejects.toThrow('content_filtered');
  });

  it('throws when the stream ends without a result', async () => {
    await expect(readTranslateStream(bodyOf(['{"delta":"a"}\n']), () => {})).rejects.toThrow(
      'Translation failed',
    );
  });
});
