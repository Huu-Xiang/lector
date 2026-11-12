import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindVocabReportEmail,
  getVocabReportDraft,
  stageVocabReportDraft,
  vocabReportAccountAction,
} from './vocab-report-draft';
import type { VocabReportSnapshot } from '../../languages/en/vocab-report';

const attemptA = '1f6cc45a-5294-4ca8-9c09-51706a31da2f';
const attemptB = '1f6cc45a-5294-4ca8-9c09-51706a31da30';
const snapshot = (attemptId: string): VocabReportSnapshot => ({
  attemptId,
  takenAt: '2026-11-12T02:23:00.000Z',
  locale: 'en',
  estimate: 4500,
  margin: 500,
  low: 4000,
  high: 5000,
  capped: false,
  level: 'B2',
  bookSlugs: ['the-time-machine'],
});

describe('vocabulary report draft', () => {
  const entries = new Map<string, string>();

  beforeEach(() => {
    entries.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      key: (index: number) => [...entries.keys()][index] ?? null,
      get length() {
        return entries.size;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps multiple browser drafts independent and refuses to replace an intended email', () => {
    expect(stageVocabReportDraft(snapshot(attemptA))).toBe(true);
    expect(stageVocabReportDraft(snapshot(attemptB))).toBe(true);
    bindVocabReportEmail(`/vocab-test?resume=report&draft=${attemptA}`, 'A@example.com');
    bindVocabReportEmail(`/vocab-test?resume=report&draft=${attemptA}`, 'b@example.com');
    expect(getVocabReportDraft(attemptA)?.expectedEmail).toBe('a@example.com');
    expect(getVocabReportDraft(attemptB)?.expectedEmail).toBeUndefined();
    expect(getVocabReportDraft(attemptB)?.snapshot).toEqual(snapshot(attemptB));
  });

  it('keeps a bounded index for independent report drafts', () => {
    for (let index = 0; index < 60; index++) {
      const id = `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
      expect(stageVocabReportDraft(snapshot(id))).toBe(true);
    }
    expect(getVocabReportDraft('10000000-0000-4000-8000-000000000000')).toBeNull();
    expect(getVocabReportDraft('10000000-0000-4000-8000-00000000003b')?.snapshot.attemptId).toBe(
      '10000000-0000-4000-8000-00000000003b',
    );
    expect(entries.size).toBeLessThanOrEqual(51);
  });

  it('stops on expired or broken drafts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T02:23:00.000Z'));
    expect(stageVocabReportDraft(snapshot(attemptA))).toBe(true);
    vi.setSystemTime(new Date('2026-11-16T02:23:00.000Z'));
    expect(getVocabReportDraft(attemptA)).toBeNull();
    const key = [...entries.keys()][0];
    if (key) entries.set(key, 'not JSON');
    expect(getVocabReportDraft(attemptA)).toBeNull();
  });

  it('only resumes automatically for the intended verified account', () => {
    expect(vocabReportAccountAction('a@example.com', null)).toBe('sign-in');
    expect(
      vocabReportAccountAction('a@example.com', {
        email: 'a@example.com',
        emailVerified: false,
      }),
    ).toBe('verify');
    expect(
      vocabReportAccountAction('a@example.com', {
        email: 'b@example.com',
        emailVerified: true,
      }),
    ).toBe('mismatch');
    expect(
      vocabReportAccountAction(undefined, {
        email: 'b@example.com',
        emailVerified: true,
      }),
    ).toBe('confirm');
    expect(
      vocabReportAccountAction('a@example.com', {
        email: 'A@example.com',
        emailVerified: true,
      }),
    ).toBe('ready');
  });
});
