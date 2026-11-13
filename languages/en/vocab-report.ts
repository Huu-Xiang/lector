export const VOCAB_REPORT_LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru'] as const;
export const VOCAB_REPORT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const VOCAB_REPORT_ATTEMPT_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function isVocabReportAttemptId(value: unknown): value is string {
  return typeof value === 'string' && VOCAB_REPORT_ATTEMPT_ID.test(value);
}

export type VocabReportLocale = (typeof VOCAB_REPORT_LOCALES)[number];
export type VocabReportLevel = (typeof VOCAB_REPORT_LEVELS)[number];

export interface VocabReportSnapshot {
  attemptId: string;
  takenAt: string;
  locale: VocabReportLocale;
  estimate: number;
  margin: number;
  low: number;
  high: number;
  capped: boolean;
  level: VocabReportLevel;
  bookSlugs: string[];
}

export type VocabReportDeliveryStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'held'
  | 'restored';

export interface VocabReport {
  snapshot: VocabReportSnapshot;
  books: { slug: string; title: string }[];
  deliveryStatus: VocabReportDeliveryStatus;
  retryUntil?: number;
}

export interface VocabReportCursor {
  takenAt: string;
  attemptId: string;
}

export interface VocabReportPage {
  reports: VocabReport[];
  nextCursor: VocabReportCursor | null;
}
