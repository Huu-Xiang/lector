export type TranslateStreamLine = { delta: string } | { result: unknown } | { error: string };

/**
 * Reads the NDJSON body of a streamed `POST /api/translate`. Calls `onText` with the
 * cumulative visible text after each delta and resolves with the final result.
 */
export async function readTranslateStream<T>(
  body: ReadableStream<Uint8Array>,
  onText: (cumulative: string) => void,
): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let text = '';
  let result: { value: T } | null = null;

  const handle = (raw: string) => {
    if (!raw.trim()) return;
    let line: TranslateStreamLine;
    try {
      line = JSON.parse(raw) as TranslateStreamLine;
    } catch {
      return;
    }
    if ('error' in line) throw new Error(line.error || 'Translation failed');
    if ('result' in line) result = { value: line.result as T };
    else if ('delta' in line && typeof line.delta === 'string') {
      text += line.delta;
      onText(text);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let newline = pending.indexOf('\n');
    while (newline !== -1) {
      handle(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }
  pending += decoder.decode();
  handle(pending);

  const final = result as { value: T } | null;
  if (!final) throw new Error('Translation failed');
  return final.value;
}
