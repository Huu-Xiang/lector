import { getSetting, setSetting } from './data-layer';
import type { ApproximateLevel } from './onboarding';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type ExamId =
  | 'ielts'
  | 'toefl'
  | 'delf'
  | 'dalf'
  | 'hsk'
  | 'topik'
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
  // HSK 2.0 has six levels; the CEFR pairing is the common one and only a guide.
  zh: {
    A1: [{ exam: 'hsk', score: '1' }],
    A2: [{ exam: 'hsk', score: '2' }],
    B1: [{ exam: 'hsk', score: '3' }],
    B2: [{ exam: 'hsk', score: '4' }],
    C1: [{ exam: 'hsk', score: '5' }],
    C2: [{ exam: 'hsk', score: '6' }],
  },
  // TOPIK I covers levels 1–2 and TOPIK II levels 3–6; the CEFR pairing is a guide only.
  ko: {
    A1: [{ exam: 'topik', score: '1' }],
    A2: [{ exam: 'topik', score: '2' }],
    B1: [{ exam: 'topik', score: '3' }],
    B2: [{ exam: 'topik', score: '4' }],
    C1: [{ exam: 'topik', score: '5' }],
    C2: [{ exam: 'topik', score: '6' }],
  },
};

/** Mainland Chinese exams show for learners whose native language is Chinese. */
export function showMainlandExams(native: string): boolean {
  return native.toLowerCase().startsWith('zh');
}

export function examRefs(language: string, level: string, mainland: boolean): ExamRef[] {
  const refs = EXAMS[language]?.[level as CefrLevel] ?? [];
  return mainland ? refs : refs.filter((ref) => !MAINLAND_EXAMS.has(ref.exam));
}

/** Exam tags as display text, e.g. ["IELTS 4.0–5.0", "TOEFL iBT 42–71", "Gaokao"]. */
export function examLabels(
  language: string,
  level: string,
  native: string,
  label: (exam: ExamId, score: string) => string,
): string[] {
  return examRefs(language, level, showMainlandExams(native)).map((ref) =>
    label(ref.exam, ref.score ?? ''),
  );
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
