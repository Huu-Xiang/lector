import { getSetting, setSetting } from './data-layer';
import type { ApproximateLevel } from './onboarding';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type ExamId =
  | 'ielts'
  | 'toefl'
  | 'delf'
  | 'dalf'
  | 'juniorHigh'
  | 'zhongkao'
  | 'gaokao'
  | 'cet4'
  | 'cet6'
  | 'tem8';

export interface ExamRef {
  exam: ExamId;
  score?: string;
}

const MAINLAND_EXAMS = new Set<ExamId>([
  'juniorHigh',
  'zhongkao',
  'gaokao',
  'cet4',
  'cet6',
  'tem8',
]);

// Rough equivalences for orientation only. Mainland exams have no official CEFR mapping.
const EXAMS: Record<string, Record<CefrLevel, ExamRef[]>> = {
  en: {
    A1: [{ exam: 'juniorHigh' }],
    A2: [{ exam: 'zhongkao' }],
    B1: [
      { exam: 'ielts', score: '4.0–5.0' },
      { exam: 'toefl', score: '42–71' },
      { exam: 'gaokao' },
      { exam: 'cet4' },
    ],
    B2: [{ exam: 'ielts', score: '5.5–6.5' }, { exam: 'toefl', score: '72–94' }, { exam: 'cet6' }],
    C1: [{ exam: 'ielts', score: '7.0–8.0' }, { exam: 'toefl', score: '95–113' }, { exam: 'tem8' }],
    C2: [
      { exam: 'ielts', score: '8.5–9.0' },
      { exam: 'toefl', score: '114–120' },
    ],
  },
  fr: {
    A1: [{ exam: 'delf', score: 'A1' }],
    A2: [{ exam: 'delf', score: 'A2' }],
    B1: [{ exam: 'delf', score: 'B1' }],
    B2: [{ exam: 'delf', score: 'B2' }],
    C1: [{ exam: 'dalf', score: 'C1' }],
    C2: [{ exam: 'dalf', score: 'C2' }],
  },
};

const MAINLAND_ZONES = new Set(['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi']);

/** Mainland exams only for a Chinese interface or a mainland time zone. */
export function showMainlandExams(locale: string): boolean {
  if (locale === 'zh-CN') return true;
  try {
    return MAINLAND_ZONES.has(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

export function examRefs(language: string, level: string, mainland: boolean): ExamRef[] {
  const refs = EXAMS[language]?.[level as CefrLevel] ?? [];
  return mainland ? refs : refs.filter((ref) => !MAINLAND_EXAMS.has(ref.exam));
}

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** The onboarding profile keeps upstream's coarse scale. */
export function approximateLevelFor(level: CefrLevel | null): ApproximateLevel {
  if (level === null) return 'not_sure';
  if (level === 'A1') return 'new';
  if (level === 'A2') return 'beginner';
  if (level === 'B1' || level === 'B2') return 'intermediate';
  return 'advanced';
}

export async function getReadingLevel(language: string): Promise<CefrLevel | null> {
  try {
    const levels = await getSetting<Record<string, string>>('readingLevels');
    const level = levels?.[language];
    return isCefrLevel(level) ? level : null;
  } catch {
    return null;
  }
}

export async function setReadingLevel(language: string, level: CefrLevel | null): Promise<void> {
  const levels = { ...((await getSetting<Record<string, string>>('readingLevels')) ?? {}) };
  if (level === null) delete levels[language];
  else levels[language] = level;
  await setSetting('readingLevels', levels);
}
