import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import {
  aiTimingReport,
  currentTimingLabel,
  labelForTask,
  parseTimingDays,
  recordAiCall,
  recordLookupOutcome,
  timingRangeEnds,
  withTimingLabel,
} from './ai-timing';

const NOW = new Date('2026-07-20T12:00:00Z');

beforeEach(() => {
  db.prepare('DELETE FROM ai_timing_daily').run();
});

describe('ai timing', () => {
  test('maps tasks to labels and lets a scope override them', () => {
    expect(labelForTask('word-gloss')).toBe('gloss');
    expect(labelForTask('phrase-rich')).toBe('phrase');
    expect(labelForTask('context-simple')).toBe('context');
    expect(labelForTask('word-enrichment')).toBe('enrich');
    expect(labelForTask(undefined)).toBe('other');
    expect(withTimingLabel('localize', () => labelForTask('word-gloss'))).toBe('localize');
    expect(withTimingLabel('prefetch', () => labelForTask('word-gloss'))).toBe('prefetch');
    expect(currentTimingLabel()).toBeUndefined();
  });

  test('reports count, p50, p95 and max from buckets', () => {
    for (const ms of [80, 90, 120, 400, 1800]) {
      recordAiCall({ task: 'word-gloss', totalMs: ms, success: true }, NOW);
    }
    const gloss = aiTimingReport('2026-07-20', '2026-07-20').total.find(
      (t) => t.label === 'gloss',
    )!;
    expect(gloss.calls).toBe(5);
    expect(gloss.p50).toBe(200);
    expect(gloss.p95).toBe(1800);
    expect(gloss.max).toBe(1800);
    expect(gloss.firstP50).toBeNull();
  });

  test('records first-token time, errors and timeouts', () => {
    recordAiCall({ task: 'word-gloss', totalMs: 900, firstTokenMs: 300, success: true }, NOW);
    recordAiCall({ task: 'word-gloss', totalMs: 10, success: false }, NOW);
    recordAiCall({ task: 'word-gloss', totalMs: 60000, success: false, timedOut: true }, NOW);
    const gloss = aiTimingReport('2026-07-20', '2026-07-20').total[0];
    expect(gloss.firstP50).toBe(300);
    expect(gloss.errors).toBe(1);
    expect(gloss.timeouts).toBe(1);
    expect(gloss.calls).toBe(1);
  });

  test('counts hits and misses and splits days', () => {
    recordLookupOutcome('lookup', 'hit', NOW);
    recordLookupOutcome('lookup', 'hit', NOW);
    recordLookupOutcome('lookup', 'miss', new Date('2026-07-19T12:00:00Z'));
    const report = aiTimingReport('2026-07-19', '2026-07-20');
    expect(report.days.map((d) => d.date)).toEqual(['2026-07-19', '2026-07-20']);
    expect(report.total[0]).toMatchObject({ label: 'lookup', hits: 2, misses: 1 });
  });

  test('stores no user data', () => {
    recordAiCall({ task: 'chat', totalMs: 100, success: true }, NOW);
    const cols = (db.prepare('PRAGMA table_info(ai_timing_daily)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(['date', 'key', 'bucket', 'count', 'maxMs']);
  });

  test('parses ranges', () => {
    expect(parseTimingDays('1')).toBe(1);
    expect(parseTimingDays('7')).toBe(7);
    expect(parseTimingDays('x')).toBe(30);
    expect(timingRangeEnds(1, NOW)).toEqual({ from: '2026-07-20', to: '2026-07-20' });
    expect(timingRangeEnds(7, NOW).from).toBe('2026-07-14');
  });
});
