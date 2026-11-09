import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { judge, judgePress, Run, RunCancelled, stepOfPhase, type Phase } from './demo-flow';

const target = { sentence: 1, index: 14 };
const word = (sentence: number, index: number) => ({ kind: 'word', sentence, index }) as const;

describe('judge', () => {
  it('takes over during the auto demo', () => {
    expect(judge('auto', word(1, 14), target)).toBe('takeover');
    expect(judge('auto', { kind: 'sentence', sentence: 0 }, target)).toBe('takeover');
  });

  it('advances only on the prompted word', () => {
    expect(judge('step-word', word(1, 14), target)).toBe('advance');
    expect(judge('step-word', word(1, 6), target)).toBe('takeover');
    expect(judge('step-word', word(0, 2), target)).toBe('takeover');
    expect(judge('step-word', { kind: 'sentence', sentence: 1 }, target)).toBe('takeover');
  });

  it('advances only on the context button in step 2', () => {
    expect(judge('step-context', { kind: 'context' }, target)).toBe('advance');
    expect(judge('step-context', word(1, 14), target)).toBe('takeover');
  });

  it('advances only on a drag across the second sentence in step 3', () => {
    expect(judge('step-sentence', { kind: 'sentence', sentence: 1 }, target)).toBe('advance');
    expect(judge('step-sentence', { kind: 'sentence', sentence: 0 }, target)).toBe('takeover');
    expect(judge('step-sentence', word(1, 14), target)).toBe('takeover');
    expect(judge('step-sentence', { kind: 'context' }, target)).toBe('takeover');
  });

  it('is free once the run ends', () => {
    for (const phase of ['done', 'free'] as Phase[]) {
      expect(judge(phase, word(0, 0), target)).toBe('free');
      expect(judge(phase, { kind: 'sentence', sentence: 0 }, target)).toBe('free');
    }
  });
});

describe('judgePress', () => {
  it('lets the prompted word or sentence be pressed', () => {
    expect(judgePress('step-word', 1, 14, target)).toBe('wait');
    expect(judgePress('step-sentence', 1, 3, target)).toBe('wait');
    expect(judgePress('free', 0, 0, target)).toBe('wait');
  });

  it('stops the run on any other press', () => {
    expect(judgePress('auto', 1, 14, target)).toBe('takeover');
    expect(judgePress('step-word', 1, 2, target)).toBe('takeover');
    expect(judgePress('step-context', 1, 14, target)).toBe('takeover');
    expect(judgePress('step-sentence', 0, 1, target)).toBe('takeover');
  });
});

describe('stepOfPhase', () => {
  it('names the step of a guided phase only', () => {
    expect(stepOfPhase('step-context')).toBe('context');
    expect(stepOfPhase('auto')).toBeNull();
    expect(stepOfPhase('done')).toBeNull();
  });
});

describe('Run', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('times out after the wait', async () => {
    const run = new Run();
    const outcome = run.waitForUser('word', 8000);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(outcome).resolves.toBe('timeout');
  });

  it('settles early when the visitor completes the step', async () => {
    const run = new Run();
    const outcome = run.waitForUser('word', 8000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run.complete('context')).toBe(false);
    expect(run.complete('word')).toBe(true);
    await expect(outcome).resolves.toBe('user');
  });

  it('rejects a pending sleep when cancelled', async () => {
    const run = new Run();
    const sleeping = run.sleep(5000);
    run.cancel();
    await expect(sleeping).rejects.toBeInstanceOf(RunCancelled);
    await expect(run.sleep(1)).rejects.toBeInstanceOf(RunCancelled);
  });

  it('leaves no unhandled rejection after the visitor wins and the run stops', async () => {
    const run = new Run();
    const outcome = run.waitForUser('word', 8000);
    run.complete('word');
    await outcome;
    run.cancel();
    await vi.advanceTimersByTimeAsync(10000);
  });
});
