/** Rolling-window limit on wrong guesses per key. Process memory only. */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 60 * 60_000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length > 0) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Seconds until one more guess is allowed, or 0 when the key may try. */
  retryAfterSeconds(key: string, now: number): number {
    const list = this.recent(key, now);
    if (list.length < this.max) return 0;
    return Math.max(1, Math.ceil((list[list.length - this.max] + this.windowMs - now) / 1000));
  }

  fail(key: string, now: number): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  attemptsLeft(key: string, now: number): number {
    return Math.max(0, this.max - this.recent(key, now).length);
  }
}
