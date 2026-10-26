import { createMiddleware } from 'hono/factory';
import { getCurrentUserId } from './user';

/** Caps how many requests of one kind run at once, in total and per user. In-process only. */
export class ConcurrencyGate {
  private total = 0;
  private readonly perKey = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly perKeyLimit: number,
  ) {}

  /** Returns a release function, or null when the gate is full. */
  tryEnter(key: string): (() => void) | null {
    const mine = this.perKey.get(key) ?? 0;
    if (this.total >= this.limit || mine >= this.perKeyLimit) return null;
    this.total++;
    this.perKey.set(key, mine + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total--;
      const left = (this.perKey.get(key) ?? 1) - 1;
      if (left > 0) this.perKey.set(key, left);
      else this.perKey.delete(key);
    };
  }
}

/** EPUB and audio uploads are buffered in memory before parsing. */
export const uploadGate = new ConcurrencyGate(3, 1);
/** Page fetches for URL import. */
export const extractUrlGate = new ConcurrencyGate(6, 2);

/** Answers 503 while the caller's slot or the whole gate is taken. */
export function gateMiddleware(gate: ConcurrencyGate) {
  return createMiddleware(async (c, next) => {
    const release = gate.tryEnter(getCurrentUserId(c));
    if (!release) {
      c.header('Retry-After', '30');
      return c.json({ error: 'The server is busy. Try again in a minute.', code: 'BUSY' }, 503);
    }
    try {
      await next();
    } finally {
      release();
    }
  });
}
