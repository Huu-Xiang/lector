import { sanitizeAuthReturnPath, vocabReportResumeFromSearch } from './auth-return';
import { isVocabReportAttemptId, type VocabReportSnapshot } from '../../languages/en/vocab-report';

const PREFIX = 'readfox-vocab-report-draft:';
const DRAFT_TTL = 3 * 24 * 60 * 60 * 1000;
const DRAFT_INDEX = PREFIX + 'index';
const MAX_PENDING_DRAFTS = 50;

interface ReportDraft {
  snapshot: VocabReportSnapshot;
  expiresAt: number;
  expectedEmail?: string;
}

function isSnapshot(value: unknown, attemptId: string): value is VocabReportSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<VocabReportSnapshot>;
  return (
    snapshot.attemptId === attemptId &&
    typeof snapshot.takenAt === 'string' &&
    Number.isFinite(Date.parse(snapshot.takenAt)) &&
    typeof snapshot.locale === 'string' &&
    typeof snapshot.level === 'string' &&
    typeof snapshot.capped === 'boolean' &&
    [snapshot.estimate, snapshot.margin, snapshot.low, snapshot.high].every(Number.isFinite) &&
    Array.isArray(snapshot.bookSlugs) &&
    snapshot.bookSlugs.every((slug) => typeof slug === 'string')
  );
}

export function getVocabReportDraft(attemptId: string): ReportDraft | null {
  if (!isVocabReportAttemptId(attemptId)) return null;
  const key = PREFIX + attemptId;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const draft = JSON.parse(raw) as Partial<ReportDraft> | null;
    if (
      !draft ||
      !Number.isFinite(draft.expiresAt) ||
      draft.expiresAt! <= Date.now() ||
      !isSnapshot(draft.snapshot, attemptId) ||
      (draft.expectedEmail !== undefined && typeof draft.expectedEmail !== 'string')
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return draft as ReportDraft;
  } catch {
    return null;
  }
}

function draftIndex(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFT_INDEX) ?? '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(isVocabReportAttemptId))].slice(-MAX_PENDING_DRAFTS);
  } catch {
    return [];
  }
}

function writeDraftIndex(attempts: string[]): void {
  localStorage.setItem(DRAFT_INDEX, JSON.stringify(attempts.slice(-MAX_PENDING_DRAFTS)));
}

export function stageVocabReportDraft(snapshot: VocabReportSnapshot): boolean {
  if (!isVocabReportAttemptId(snapshot.attemptId)) return false;
  try {
    if (getVocabReportDraft(snapshot.attemptId)) return true;
    const attempts = draftIndex().filter((attemptId) => attemptId !== snapshot.attemptId);
    attempts.push(snapshot.attemptId);
    while (attempts.length > MAX_PENDING_DRAFTS) {
      localStorage.removeItem(PREFIX + attempts.shift());
    }
    const draft: ReportDraft = { snapshot, expiresAt: Date.now() + DRAFT_TTL };
    localStorage.setItem(PREFIX + snapshot.attemptId, JSON.stringify(draft));
    writeDraftIndex(attempts);
    return true;
  } catch {
    return false;
  }
}

/** A draft's first email target survives subsequent login and verification attempts. */
export function bindVocabReportEmail(returnPath: string | null, email: string): void {
  const safePath = sanitizeAuthReturnPath(returnPath);
  if (!safePath) return;
  const attemptId = vocabReportResumeFromSearch(
    safePath.slice(safePath.indexOf('?') + 1),
  )?.attemptId;
  if (!attemptId) return;
  const draft = getVocabReportDraft(attemptId);
  if (!draft || draft.expectedEmail) return;
  try {
    localStorage.setItem(
      PREFIX + attemptId,
      JSON.stringify({ ...draft, expectedEmail: normalizeEmail(email) }),
    );
  } catch {
    // Storage can be blocked. An unbound draft requires explicit account confirmation.
  }
}

export function clearVocabReportDraft(attemptId: string): void {
  try {
    localStorage.removeItem(PREFIX + attemptId);
    writeDraftIndex(draftIndex().filter((stored) => stored !== attemptId));
  } catch {
    // The server also deduplicates repeated submissions.
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function vocabReportAccountAction(
  expectedEmail: string | undefined,
  user: { email: string; emailVerified: boolean } | null,
): 'sign-in' | 'verify' | 'mismatch' | 'confirm' | 'ready' {
  if (!user) return 'sign-in';
  if (expectedEmail && normalizeEmail(user.email) !== expectedEmail) return 'mismatch';
  if (!user.emailVerified) return 'verify';
  return expectedEmail ? 'ready' : 'confirm';
}
