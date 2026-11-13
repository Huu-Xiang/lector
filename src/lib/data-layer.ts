/**
 * Data Layer — persistence via the Hono API.
 *
 * All persistence goes through apiFetch() to the Hono API directly; the Next.js
 * `/api/*` proxy routes were removed in #188. Shared domain types live in
 * src/types.
 */

import {
  DEFAULT_LANGUAGE,
  foldWord,
  getLanguageConfig,
  isValidLanguageCode,
  lookupByVocabKeys,
} from './languages';
import { apiFetch, apiUrl } from './api-base';
import { VOCAB_SAVED_EVENT } from '@/constants/storage';
import { activeTenantId, readLanguageCache } from './language-cache';
import { ONBOARDING_QUERY_SCOPE } from './onboarding';
import {
  cachedQuery,
  clearTenantQueries,
  invalidateQueries,
  keepNewestQueries,
  markQueriesStale,
  patchQuery,
  peekQuery,
  type QueryKey,
} from './query-cache';

// Active language helper — reads the tenant-keyed cache (#281), falls back
// to the default (SSR, cloud pre-session, or simply nothing cached yet).
export function getActiveLanguage(): string {
  return readLanguageCache() || DEFAULT_LANGUAGE;
}

/** The active language's full pack (non-hook twin of useActiveLanguage). */
export function getActivePack() {
  const code = getActiveLanguage();
  return getLanguageConfig(isValidLanguageCode(code) ? code : DEFAULT_LANGUAGE);
}

function langParam(prefix: '?' | '&' = '?'): string {
  return `${prefix}language=${getActiveLanguage()}`;
}

function activeLanguageQueryKey(
  scope: string,
  params?: QueryKey['params'],
  language: string = getActiveLanguage(),
): QueryKey | null {
  const tenant = activeTenantId();
  if (tenant === null) return null;
  return { tenant, language, scope, params };
}

function activeTenantQueryKey(scope: string, params?: QueryKey['params']): QueryKey | null {
  const tenant = activeTenantId();
  if (tenant === null) return null;
  return { tenant, scope, params };
}

function invalidateActiveScope(scope: string): void {
  const tenant = activeTenantId();
  if (tenant !== null) invalidateQueries({ tenant, scope });
}

/** For saves made while reading: the remembered pages stay and refresh in the background. */
function markActiveScopeStale(scope: string): void {
  const tenant = activeTenantId();
  if (tenant !== null) markQueriesStale({ tenant, scope });
}

const COLLECTIONS_QUERY_SCOPE = 'collections';
const VOCAB_QUERY_SCOPE = 'vocab';
const DAILY_STATS_QUERY_SCOPE = 'stats:daily';
const FLUENCY_STATS_QUERY_SCOPE = 'stats:fluency';
const READING_STATS_QUERY_SCOPE = 'stats:reading';
const READINGS_QUERY_SCOPE = 'readings';
const GROUPS_QUERY_SCOPE = 'groups';
const CLOZE_QUERY_SCOPE = 'cloze';
const JOURNAL_QUERY_SCOPE = 'journal';
const REVIEW_QUERY_SCOPE = 'review';
const SETTINGS_QUERY_SCOPE = 'settings';
const FEED_QUERY_SCOPE = 'feed';
const LESSONS_QUERY_SCOPE = 'lessons';
const REMEMBERED_LESSONS = 5;
const PERSIST = { persist: true } as const;

export const QUERY_SCOPES = {
  collections: COLLECTIONS_QUERY_SCOPE,
  groups: GROUPS_QUERY_SCOPE,
  vocab: VOCAB_QUERY_SCOPE,
  dailyStats: DAILY_STATS_QUERY_SCOPE,
  fluencyStats: FLUENCY_STATS_QUERY_SCOPE,
  readingStats: READING_STATS_QUERY_SCOPE,
  cloze: CLOZE_QUERY_SCOPE,
  journal: JOURNAL_QUERY_SCOPE,
  review: REVIEW_QUERY_SCOPE,
  settings: SETTINGS_QUERY_SCOPE,
  feed: FEED_QUERY_SCOPE,
  lessons: LESSONS_QUERY_SCOPE,
  onboarding: ONBOARDING_QUERY_SCOPE,
} as const;

function invalidateCollections(): void {
  invalidateActiveScope(COLLECTIONS_QUERY_SCOPE);
}

function invalidateVocab(): void {
  invalidateActiveScope(VOCAB_QUERY_SCOPE);
  invalidateActiveScope(REVIEW_QUERY_SCOPE);
}

function markVocabStale(): void {
  markActiveScopeStale(VOCAB_QUERY_SCOPE);
  markActiveScopeStale(REVIEW_QUERY_SCOPE);
  markActiveScopeStale(FLUENCY_STATS_QUERY_SCOPE);
}

function invalidateGroups(): void {
  invalidateActiveScope(GROUPS_QUERY_SCOPE);
}

function invalidateCloze(): void {
  invalidateActiveScope(CLOZE_QUERY_SCOPE);
}

function invalidateJournal(): void {
  invalidateActiveScope(JOURNAL_QUERY_SCOPE);
}

function invalidateReview(): void {
  invalidateActiveScope(REVIEW_QUERY_SCOPE);
}

function invalidateSettings(): void {
  invalidateActiveScope(SETTINGS_QUERY_SCOPE);
}

function invalidateLessons(): void {
  invalidateActiveScope(LESSONS_QUERY_SCOPE);
}

/** Pass `fresh` where a stale value would mislead, e.g. a transcription poll. */
export interface ReadOptions {
  fresh?: boolean;
}

function persisted(options?: ReadOptions) {
  return { persist: true, forceFresh: options?.fresh ?? false } as const;
}

function invalidateDailyStats(): void {
  invalidateActiveScope(DAILY_STATS_QUERY_SCOPE);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DAILY_STATS_EVENT));
}

function invalidateFluencyStats(): void {
  invalidateActiveScope(FLUENCY_STATS_QUERY_SCOPE);
}

function invalidateReadingStats(): void {
  invalidateActiveScope(READING_STATS_QUERY_SCOPE);
}

async function apiError(res: Response, fallback: string): Promise<Error> {
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  return new Error(typeof body.error === 'string' ? body.error : fallback);
}

async function requireOk(res: Response, fallback: string): Promise<void> {
  if (!res.ok) throw await apiError(res, fallback);
}

// Re-export the shared domain types for convenience
export type {
  WordState,
  VocabType,
  ClozeMasteryLevel,
  ClozeSource,
  ClozeCollection,
  Collection,
  CollectionGroup,
  Lesson,
  LessonSummary,
  VocabEntry,
  KnownWord,
  ClozeSentence,
  DailyStats,
  Settings,
  TranscriptSegment,
  AudioTranscriptSegment,
  TranscriptionStatus,
} from '@/types';

export type { ReadingStats } from './stats-derive';

import { DAILY_STATS_EVENT, type DailyGoal, type StreakStatus } from './daily-goal';
import type {
  WordState,
  Collection,
  CollectionGroup,
  Lesson,
  LessonSummary,
  VocabEntry,
  KnownWord,
  ClozeSentence,
  DailyStats,
  ClozeCollection,
  ClozeMasteryLevel,
  AudioTranscriptSegment,
  ReviewAnswerResult,
  ReviewCounts,
  ReviewGoal,
  ReviewExampleResult,
  ReviewQueue,
  SentenceTranslation,
  ReviewQuestionType,
  ReviewRawAnswer,
} from '@/types';

// ============================================================================
// Helper Functions - Collections
// ============================================================================

export async function getAllCollections(): Promise<Collection[]> {
  return cachedQuery(
    activeLanguageQueryKey(COLLECTIONS_QUERY_SCOPE),
    async () => {
      const res = await apiFetch(`/api/collections${langParam()}`);
      await requireOk(res, 'Could not load your library');
      return res.json();
    },
    PERSIST,
  );
}

export function peekAllCollections(): Collection[] | undefined {
  return peekQuery(activeLanguageQueryKey(COLLECTIONS_QUERY_SCOPE));
}

export async function getCollection(
  id: string,
  options?: ReadOptions,
): Promise<Collection | undefined> {
  return cachedQuery(
    activeTenantQueryKey(COLLECTIONS_QUERY_SCOPE, ['one', id]),
    async () => {
      const res = await apiFetch(`/api/collections/${id}`);
      if (res.status === 404) return undefined;
      await requireOk(res, 'Could not load the book');
      return (await res.json()) as Collection;
    },
    persisted(options),
  );
}

export function peekCollection(id: string): Collection | undefined {
  return peekQuery(activeTenantQueryKey(COLLECTIONS_QUERY_SCOPE, ['one', id]));
}

export async function createCollection(data: {
  title: string;
  author?: string;
  groupId?: string | null;
}): Promise<string> {
  const res = await apiFetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, language: getActiveLanguage() }),
  });
  if (!res.ok) throw await apiError(res, 'Could not create collection');
  const { id } = await res.json();
  invalidateCollections();
  invalidateReadingStats();
  return id;
}

export async function reorderCollections(ids: string[]): Promise<void> {
  const res = await apiFetch('/api/collections/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  await requireOk(res, 'Could not reorder collections');
  invalidateCollections();
}

export async function deleteCollection(id: string): Promise<void> {
  const res = await apiFetch(`/api/collections/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete collection');
  invalidateCollections();
  invalidateReadingStats();
}

export async function updateCollection(
  id: string,
  data: { title?: string; author?: string; groupId?: string | null },
): Promise<void> {
  const res = await apiFetch(`/api/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await requireOk(res, 'Could not update collection');
  invalidateCollections();
  invalidateReadingStats();
}

// ============================================================================
// Helper Functions - Groups
// ============================================================================

export async function getAllGroups(): Promise<CollectionGroup[]> {
  return cachedQuery(
    activeTenantQueryKey(GROUPS_QUERY_SCOPE),
    async () => {
      const res = await apiFetch('/api/groups');
      await requireOk(res, 'Could not load your groups');
      return res.json();
    },
    PERSIST,
  );
}

export function peekAllGroups(): CollectionGroup[] | undefined {
  return peekQuery(activeTenantQueryKey(GROUPS_QUERY_SCOPE));
}

export async function createGroup(name: string): Promise<string> {
  const res = await apiFetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await requireOk(res, 'Could not create group');
  invalidateGroups();
  const { id } = await res.json();
  return id;
}

export async function updateGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
): Promise<void> {
  const res = await apiFetch(`/api/groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await requireOk(res, 'Could not update group');
  invalidateCollections();
  invalidateGroups();
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete group');
  invalidateCollections();
  invalidateGroups();
}

// ============================================================================
// Helper Functions - Lessons
// ============================================================================

export async function getLessonsForCollection(
  collectionId: string,
  options?: ReadOptions,
): Promise<LessonSummary[]> {
  return cachedQuery(
    activeTenantQueryKey(LESSONS_QUERY_SCOPE, ['list', collectionId]),
    async () => {
      const res = await apiFetch(`/api/collections/${collectionId}/lessons`);
      await requireOk(res, 'Could not load the chapters');
      return (await res.json()) as LessonSummary[];
    },
    persisted(options),
  );
}

export function peekLessonsForCollection(collectionId: string): LessonSummary[] | undefined {
  return peekQuery(activeTenantQueryKey(LESSONS_QUERY_SCOPE, ['list', collectionId]));
}

export async function getLesson(id: string, options?: ReadOptions): Promise<Lesson | undefined> {
  const lesson = await cachedQuery(
    activeTenantQueryKey(LESSONS_QUERY_SCOPE, ['lesson', id]),
    async () => {
      const res = await apiFetch(`/api/lessons/${id}`);
      if (res.status === 404) return undefined;
      await requireOk(res, 'Could not load the lesson');
      const fetched = (await res.json()) as Lesson;
      const tenant = activeTenantId();
      if (tenant !== null) {
        setTimeout(() =>
          keepNewestQueries({ tenant, scope: LESSONS_QUERY_SCOPE }, 'lesson', REMEMBERED_LESSONS),
        );
      }
      return fetched;
    },
    persisted(options),
  );
  return lesson;
}

export function peekLesson(id: string): Lesson | undefined {
  return peekQuery(activeTenantQueryKey(LESSONS_QUERY_SCOPE, ['lesson', id]));
}

export async function addLessonToCollection(
  collectionId: string,
  data: { title: string; textContent: string },
): Promise<string> {
  const res = await apiFetch(`/api/collections/${collectionId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, 'Could not create lesson');
  const { id } = await res.json();
  invalidateCollections();
  invalidateLessons();
  invalidateReadingStats();
  return id;
}

export async function updateLesson(
  id: string,
  data: { title?: string; textContent?: string },
): Promise<void> {
  const res = await apiFetch(`/api/lessons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await requireOk(res, 'Could not update lesson');
  invalidateLessons();
  invalidateReadingStats();
  // An edit can add words the cached readings have no entry for, so drop them
  // and let the reader fetch the set for the new text (#289 4.4).
  if (data.textContent !== undefined) invalidateActiveScope(READINGS_QUERY_SCOPE);
}

export async function deleteLesson(id: string): Promise<void> {
  const res = await apiFetch(`/api/lessons/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete lesson');
  invalidateCollections();
  invalidateLessons();
  invalidateReadingStats();
}

export async function reorderLessons(collectionId: string, ids: string[]): Promise<void> {
  const res = await apiFetch(`/api/collections/${collectionId}/lessons/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  await requireOk(res, 'Could not reorder lessons');
  invalidateLessons();
}

export async function updateLessonProgress(
  id: string,
  progress: { scrollPosition?: number; percentComplete?: number },
): Promise<boolean> {
  const res = await apiFetch(`/api/lessons/${id}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  });
  // Reader scroll persistence is intentionally best-effort. A transient
  // failure must not interrupt reading or create an unhandled rejection.
  if (res.ok) {
    patchQuery<Lesson | undefined>(
      activeTenantQueryKey(LESSONS_QUERY_SCOPE, ['lesson', id]),
      (lesson) =>
        lesson && {
          ...lesson,
          progress_scrollPosition: progress.scrollPosition ?? lesson.progress_scrollPosition,
          progress_percentComplete: progress.percentComplete ?? lesson.progress_percentComplete,
        },
    );
    markActiveScopeStale(COLLECTIONS_QUERY_SCOPE);
    markActiveScopeStale(READING_STATS_QUERY_SCOPE);
  }
  return res.ok;
}

export async function importEpub(
  file: File,
  groupId?: string | null,
): Promise<{
  collectionId: string;
  title: string;
  author: string;
  lessonCount: number;
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', getActiveLanguage());
  if (groupId) formData.append('groupId', groupId);
  const res = await apiFetch('/api/import/epub', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to import EPUB');
  }
  const imported = await res.json();
  invalidateCollections();
  invalidateLessons();
  invalidateReadingStats();
  return imported;
}

export async function importAudio(
  file: File,
  title?: string,
  groupId?: string | null,
): Promise<{
  collectionId: string;
  lessonId: string;
  title: string;
  audioDurationMs: number | null;
  transcriptionStatus: 'pending';
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', getActiveLanguage());
  if (title) formData.append('title', title);
  if (groupId) formData.append('groupId', groupId);
  const res = await apiFetch('/api/import/audio', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to import audio');
  }
  const imported = await res.json();
  invalidateCollections();
  invalidateLessons();
  invalidateReadingStats();
  return imported;
}

/** Transcript segments for listen-along (#185); empty until transcription is done. */
export async function getLessonSegments(lessonId: string): Promise<AudioTranscriptSegment[]> {
  const res = await apiFetch(`/api/lessons/${lessonId}/segments`);
  if (!res.ok) return [];
  return res.json();
}

/** Direct (range-seekable) audio URL for an audio-backed lesson — feed it to <audio src>. */
export function lessonAudioUrl(lessonId: string): string {
  return apiUrl(`/api/lessons/${lessonId}/audio`);
}

export async function retryTranscription(lessonId: string): Promise<void> {
  const res = await apiFetch(`/api/lessons/${lessonId}/retry-transcription`, { method: 'POST' });
  await requireOk(res, 'Could not retry transcription');
  invalidateCollections();
  invalidateLessons();
}

export async function createStandaloneLesson(data: {
  title: string;
  author: string;
  textContent: string;
  groupId?: string | null;
}): Promise<{ collectionId: string; lessonId: string }> {
  // Create a collection with a single lesson
  const collectionId = await createCollection({
    title: data.title,
    author: data.author,
    groupId: data.groupId ?? null,
  });
  const res = await apiFetch(`/api/collections/${collectionId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: data.title, textContent: data.textContent }),
  });
  if (!res.ok) {
    // The operation spans two legacy endpoints. If the authoritative lesson
    // limit rejects the second half, remove the collection created solely for
    // this import so a capped Free account does not accumulate empty shells.
    await apiFetch(`/api/collections/${collectionId}`, { method: 'DELETE' });
    invalidateCollections();
    invalidateReadingStats();
    throw await apiError(res, 'Could not create imported lesson');
  }
  const { id: lessonId } = await res.json();
  invalidateCollections();
  invalidateReadingStats();
  return { collectionId, lessonId };
}

// ---------------------------------------------------------------------------
// YouTube transcript import (#334)
// ---------------------------------------------------------------------------

export interface YouTubeCaptionTrack {
  languageCode: string;
  languageName: string;
  kind: 'standard' | 'asr';
}

export interface YouTubeResolveResult {
  videoId: string;
  title: string;
  channel: string;
  tracks: YouTubeCaptionTrack[];
}

/** Discriminated result so the modal can show an actionable message per code. */
export type YouTubeResolveResponse =
  | { ok: true; data: YouTubeResolveResult }
  | { ok: false; code: string; message: string };

/** List a video's available caption tracks + metadata (no persistence). */
export async function resolveYouTubeTranscript(url: string): Promise<YouTubeResolveResponse> {
  const res = await apiFetch('/api/import/youtube/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      code: body.code || 'FETCH_FAILED',
      message: body.error || 'Could not resolve that YouTube video.',
    };
  }
  return { ok: true, data: body as YouTubeResolveResult };
}

/** Import a chosen caption track as a timestamped transcript lesson. */
export async function importYouTubeTranscript(input: {
  url: string;
  languageCode: string;
  kind: 'standard' | 'asr';
  groupId?: string | null;
}): Promise<{ collectionId: string; lessonId: string; title: string; segmentCount: number }> {
  const res = await apiFetch('/api/import/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, language: getActiveLanguage() }),
  });
  if (!res.ok) throw await apiError(res, 'Could not import the transcript');
  const imported = await res.json();
  invalidateCollections();
  invalidateLessons();
  invalidateReadingStats();
  return imported;
}

// ============================================================================
// Helper Functions - Vocabulary
// ============================================================================

const mappedVocab = new WeakMap<Record<string, unknown>[], VocabEntry[]>();

function vocabFromRows(rows: Record<string, unknown>[]): VocabEntry[] {
  const known = mappedVocab.get(rows);
  if (known) return known;
  const entries = rows.map(
    (v) =>
      ({
        ...v,
        stateUpdatedAt: new Date(v.stateUpdatedAt as string),
        createdAt: new Date(v.createdAt as string),
      }) as unknown as VocabEntry,
  );
  mappedVocab.set(rows, entries);
  return entries;
}

export async function getAllVocab(): Promise<VocabEntry[]> {
  const rows = await cachedQuery(
    activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['all']),
    async () => {
      const res = await apiFetch(`/api/vocab${langParam()}`);
      await requireOk(res, 'Could not load your words');
      return (await res.json()) as Record<string, unknown>[];
    },
    PERSIST,
  );
  return vocabFromRows(rows);
}

export function peekAllVocab(): VocabEntry[] | undefined {
  const rows = peekQuery<Record<string, unknown>[]>(
    activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['all']),
  );
  return rows ? vocabFromRows(rows) : undefined;
}

/**
 * Per-word readings for one lesson's annotation layer (#289 4.4), keyed by the
 * FOLDED word so the reader can look one up with the key it already folds for
 * word state. Empty when the language declares no annotation source.
 *
 * `language` is passed explicitly and must be the LESSON's, not the active one.
 * The reader tokenizes with the lesson's pack (MarkdownReader picks
 * `lesson.language` over `activeLang` on purpose), so keying this cache on the
 * active language would serve a zh lesson no readings whenever the client's
 * active language differs.
 *
 * The returned Map is fetched once per lesson and never patched, so callers can
 * compare it by identity — which is what keeps the reader's per-block memo
 * comparator cheap.
 */
export async function getLessonReadings(
  lessonId: string,
  language: string,
): Promise<Map<string, string>> {
  const result = await cachedQuery(
    activeLanguageQueryKey(READINGS_QUERY_SCOPE, ['lesson', lessonId], language),
    async () => {
      const res = await apiFetch(`/api/lessons/${lessonId}/readings?language=${language}`);
      // THROW rather than answer an empty map. A failure that returns `{}` is
      // indistinguishable from a lesson that genuinely has no readings, so the
      // cache stored it as a real result and the reader drew no ruby until it
      // remounted. A rejection makes `cachedQuery` drop the entry instead, so
      // the next attempt asks again.
      if (!res.ok) throw await apiError(res, 'Could not load readings');
      return (await res.json()) as Record<string, string>;
    },
  );
  return new Map(Object.entries(result ?? {}));
}

export async function getVocabEntry(id: string): Promise<VocabEntry | undefined> {
  return cachedQuery(activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['id', id]), async () => {
    const res = await apiFetch(`/api/vocab/${id}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    return {
      ...data,
      stateUpdatedAt: new Date(data.stateUpdatedAt),
      createdAt: new Date(data.createdAt),
    };
  });
}

export async function getVocabByText(text: string): Promise<VocabEntry | undefined> {
  // The server filters by exact text (#240) — newest row first, so [0] matches
  // what the old client-side `.find()` over the DESC-ordered list returned.
  return cachedQuery(activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['text', text]), async () => {
    const res = await apiFetch(`/api/vocab${langParam()}&text=${encodeURIComponent(text)}`);
    const vocab = await res.json();
    const match = vocab[0];
    if (!match) return undefined;
    return {
      ...match,
      stateUpdatedAt: new Date(match.stateUpdatedAt),
      createdAt: new Date(match.createdAt),
    };
  });
}

export async function saveVocab(
  entry: VocabEntry,
  options: { silentPlanLimit?: boolean } = {},
): Promise<string | null> {
  const res = await apiFetch('/api/vocab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry, language: getActiveLanguage() }),
    silentPlanLimit: options.silentPlanLimit,
  });
  // null = not persisted (#232) — the reader's word-save handlers gate their
  // optimistic UI on this.
  if (!res.ok) return null;
  markVocabStale();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VOCAB_SAVED_EVENT));
  const { id } = await res.json();
  return id;
}

/** Sends one word saved while offline. 'retry' keeps it queued; 'rejected' drops it for good. */
export async function postQueuedVocab(word: {
  vocabId: string;
  text: string;
  type: VocabEntry['type'];
  sentence: string;
  language: string;
  lessonId: string;
}): Promise<'ok' | 'rejected' | 'retry'> {
  const res = await apiFetch('/api/vocab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: word.vocabId,
      text: word.text,
      type: word.type,
      sentence: word.sentence,
      translation: '',
      state: 'new',
      reviewCount: 0,
      bookId: word.lessonId,
      language: word.language,
    }),
  });
  if (res.ok) {
    markVocabStale();
    return 'ok';
  }
  return res.status >= 500 || res.status === 401 || res.status === 408 ? 'retry' : 'rejected';
}

export async function updateVocabState(id: string, state: WordState): Promise<boolean> {
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (res.ok) markVocabStale();
  return res.ok;
}

/** Persist the editable fields exposed by the vocab detail modal in one write. */
export async function updateVocabEntry(
  id: string,
  updates: Partial<Pick<VocabEntry, 'state' | 'translation' | 'translationLang' | 'sentence'>>,
): Promise<void> {
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw await apiError(res, 'Could not update vocabulary entry');
  invalidateVocab();
  invalidateFluencyStats();
}

export async function getVocabByState(state: WordState): Promise<VocabEntry[]> {
  return cachedQuery(activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['state', state]), async () => {
    const res = await apiFetch(`/api/vocab${langParam()}&state=${state}`);
    const vocab = await res.json();
    return vocab.map((v: Record<string, unknown>) => ({
      ...v,
      stateUpdatedAt: new Date(v.stateUpdatedAt as string),
      createdAt: new Date(v.createdAt as string),
    }));
  });
}

export async function getVocabForBook(bookId: string): Promise<VocabEntry[]> {
  return cachedQuery(activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['book', bookId]), async () => {
    const res = await apiFetch(`/api/vocab${langParam()}&bookId=${bookId}`);
    const vocab = await res.json();
    return vocab.map((v: Record<string, unknown>) => ({
      ...v,
      stateUpdatedAt: new Date(v.stateUpdatedAt as string),
      createdAt: new Date(v.createdAt as string),
    }));
  });
}

export async function getUnpushedVocab(): Promise<VocabEntry[]> {
  return cachedQuery(activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['unpushed']), async () => {
    const res = await apiFetch(`/api/vocab${langParam()}&unpushed=true`);
    const vocab = await res.json();
    return vocab.map((v: Record<string, unknown>) => ({
      ...v,
      stateUpdatedAt: new Date(v.stateUpdatedAt as string),
      createdAt: new Date(v.createdAt as string),
    }));
  });
}

export async function markVocabPushedToAnki(id: string, ankiNoteId: number): Promise<number> {
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pushedToAnki: true, ankiNoteId }),
  });
  if (res.ok) invalidateVocab();
  return res.ok ? 1 : 0;
}

export async function deleteVocabEntry(id: string): Promise<void> {
  const res = await apiFetch(`/api/vocab/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete vocabulary entry');
  invalidateVocab();
  invalidateFluencyStats();
}

export async function bulkDeleteVocabEntries(
  vocabIDs: string[],
): Promise<{ success: boolean; message: string }> {
  const req = await apiFetch(`/api/vocab/bulk-delete`, {
    body: JSON.stringify({ vocabIDs }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const res = await req.json();

  if (!req.ok) {
    return {
      success: false,
      message: res.error?.message,
    };
  }

  invalidateVocab();
  invalidateFluencyStats();

  return res;
}

// ============================================================================
// Helper Functions - Known Words (Fast Lookup)
// ============================================================================

export async function getWordState(word: string): Promise<WordState | undefined> {
  const map = await getKnownWordsMap();
  return lookupByVocabKeys(map, word, getActivePack());
}

export async function updateWordState(word: string, state: WordState): Promise<boolean> {
  // Signals success (#232): apiFetch never throws (it returns a synthetic 502
  // on network failure), so callers must check res.ok or a failed save looks
  // exactly like a successful one.
  const res = await apiFetch('/api/known-words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      updates: [{ word: foldWord(word, getActivePack()), state }],
      language: getActiveLanguage(),
    }),
  });
  if (res.ok) markVocabStale();
  return res.ok;
}

export async function getKnownWordsMap(): Promise<Map<string, WordState>> {
  const data = await cachedQuery(
    activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['known']),
    async () => {
      const res = await apiFetch(`/api/known-words${langParam()}`);
      await requireOk(res, 'Could not load word states');
      return (await res.json()) as Record<string, WordState>;
    },
    PERSIST,
  );
  return new Map(Object.entries(data ?? {}));
}

export function peekKnownWordsMap(): Map<string, WordState> | undefined {
  const data = peekQuery<Record<string, WordState>>(
    activeLanguageQueryKey(VOCAB_QUERY_SCOPE, ['known']),
  );
  return data ? new Map(Object.entries(data)) : undefined;
}

// ============================================================================
// Plan entitlements (#222) — informational; enforcement is server-side
// ============================================================================

export interface ClientEntitlements {
  plan: 'free' | 'cloud' | 'plus' | 'max' | 'unlimited';
  byok: boolean;
  /** A fixed-period paid tier (RMB payment or code), when one is active. */
  grant?: { plan: 'cloud' | 'plus' | 'max'; endsAt: string } | null;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
  periods: { day: string; month: string };
}

let entitlementsCache: {
  tenantId: string;
  value: ClientEntitlements;
  at: number;
} | null = null;

/** Provider/funding changes alter effective limits immediately. */
export function invalidateEntitlementsCache(): void {
  entitlementsCache = null;
}

/**
 * The account's plan limits + this month's usage, cached for five minutes —
 * surfaces read it to REFLECT limits (reader selection cap, journal meter);
 * the API enforces them regardless. Null when the endpoint is unavailable
 * (network hiccup) — callers must treat null as "don't reflect anything".
 */
export async function getEntitlements(): Promise<ClientEntitlements | null> {
  const tenantId = activeTenantId();
  if (
    tenantId !== null &&
    entitlementsCache?.tenantId === tenantId &&
    Date.now() - entitlementsCache.at < 5 * 60_000
  ) {
    return entitlementsCache.value;
  }
  const res = await apiFetch('/api/billing/entitlements');
  if (!res.ok) return null;
  const value = (await res.json()) as ClientEntitlements;
  // Cloud pre-session reads must never become a browser-global cache entry.
  // AuthGuard records the tenant before app surfaces mount; selfhost uses the
  // stable `local` namespace.
  if (tenantId !== null) entitlementsCache = { tenantId, value, at: Date.now() };
  return value;
}

export async function getAllKnownWords(): Promise<KnownWord[]> {
  const res = await apiFetch(`/api/known-words${langParam()}`);
  const data = await res.json();
  return Object.entries(data).map(([word, state]) => ({ word, state: state as WordState }));
}

export async function bulkUpdateWordStates(
  updates: Array<{ word: string; state: WordState }>,
): Promise<void> {
  const res = await apiFetch('/api/known-words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates, language: getActiveLanguage() }),
  });
  await requireOk(res, 'Could not update known words');
  invalidateFluencyStats();
  invalidateActiveScope(VOCAB_QUERY_SCOPE);
}

// ============================================================================
// Helper Functions - Cloze Sentences
// ============================================================================

export async function getClozeSentence(id: string): Promise<ClozeSentence | undefined> {
  const res = await apiFetch(`/api/cloze/${id}${langParam()}`);
  if (!res.ok) return undefined;
  const data = await res.json();
  return {
    ...data,
    nextReview: new Date(data.nextReview),
    lastReviewed: data.lastReviewed ? new Date(data.lastReviewed) : undefined,
  };
}

export async function saveClozeSentence(sentence: ClozeSentence): Promise<string> {
  const res = await apiFetch('/api/cloze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...sentence,
      nextReview: sentence.nextReview.toISOString(),
      lastReviewed: sentence.lastReviewed?.toISOString(),
      language: getActiveLanguage(),
    }),
  });
  await requireOk(res, 'Could not save practice sentence');
  invalidateCloze();
  const { id } = await res.json();
  return id;
}

export async function getClozeSentencesDueForReview(limit: number = 20): Promise<ClozeSentence[]> {
  const res = await apiFetch(`/api/cloze/due?limit=${limit}${langParam('&')}`);
  const sentences = await res.json();
  return sentences.map((s: Record<string, unknown>) => ({
    ...s,
    nextReview: new Date(s.nextReview as string),
    lastReviewed: s.lastReviewed ? new Date(s.lastReviewed as string) : undefined,
  }));
}

export async function updateClozeAfterReview(
  id: string,
  correct: boolean,
  newMasteryLevel: ClozeMasteryLevel,
  nextReview: Date,
): Promise<number> {
  const res = await apiFetch(`/api/cloze/${id}/review${langParam()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      correct,
      masteryLevel: newMasteryLevel,
      nextReview: nextReview.toISOString(),
    }),
  });
  if (res.ok) invalidateCloze();
  return res.ok ? 1 : 0;
}

export async function getAllClozeSentences(): Promise<ClozeSentence[]> {
  const res = await apiFetch(`/api/cloze${langParam()}&limit=10000`);
  const sentences = await res.json();
  return sentences.map((s: Record<string, unknown>) => ({
    ...s,
    nextReview: new Date(s.nextReview as string),
    lastReviewed: s.lastReviewed ? new Date(s.lastReviewed as string) : undefined,
  }));
}

type ClozeTotals = { timesCorrect: number; timesIncorrect: number };

export async function getClozeTotals(): Promise<ClozeTotals> {
  return cachedQuery(
    activeLanguageQueryKey(CLOZE_QUERY_SCOPE, ['totals']),
    async () => {
      const res = await apiFetch(`/api/cloze/stats${langParam()}`);
      await requireOk(res, 'Could not load practice totals');
      return res.json();
    },
    PERSIST,
  );
}

export function peekClozeTotals(): ClozeTotals | undefined {
  return peekQuery(activeLanguageQueryKey(CLOZE_QUERY_SCOPE, ['totals']));
}

export async function getClozeSentenceByTatoebaId(
  tatoebaSentenceId: number,
): Promise<ClozeSentence | undefined> {
  const all = await getAllClozeSentences();
  return all.find((s) => s.tatoebaSentenceId === tatoebaSentenceId);
}

export async function getClozeSentencesForWord(word: string): Promise<ClozeSentence[]> {
  const res = await apiFetch(`/api/cloze${langParam()}&word=${encodeURIComponent(word)}`);
  const sentences = await res.json();
  return sentences.map((s: Record<string, unknown>) => ({
    ...s,
    nextReview: new Date(s.nextReview as string),
    lastReviewed: s.lastReviewed ? new Date(s.lastReviewed as string) : undefined,
  }));
}

export async function bulkSaveClozeSentences(sentences: ClozeSentence[]): Promise<void> {
  const res = await apiFetch('/api/cloze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      sentences.map((s) => ({
        ...s,
        nextReview: s.nextReview.toISOString(),
        lastReviewed: s.lastReviewed?.toISOString(),
        language: getActiveLanguage(),
      })),
    ),
  });
  await requireOk(res, 'Could not save practice sentences');
  invalidateCloze();
}

export async function seedSentenceBank(): Promise<{ seeded: number; total: number }> {
  const res = await apiFetch('/api/cloze/seed', { method: 'POST' });
  // Seed refresh runs during practice initialization and is best-effort.
  if (!res.ok) return { seeded: 0, total: 0 };
  const result = (await res.json()) as { seeded: number; total: number };
  if (result.seeded > 0) invalidateCloze();
  return result;
}

export async function blacklistClozeSentence(id: string): Promise<void> {
  const res = await apiFetch(`/api/cloze/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blacklisted: 1 }),
  });
  await requireOk(res, 'Could not hide practice sentence');
  invalidateCloze();
}

export async function unblacklistClozeSentence(id: string): Promise<void> {
  const res = await apiFetch(`/api/cloze/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blacklisted: 0 }),
  });
  await requireOk(res, 'Could not restore practice sentence');
  invalidateCloze();
}

export async function getClozeSentencesByCollection(
  collection: ClozeCollection,
  limit: number = 20,
  excludeWords: string[] = [],
): Promise<ClozeSentence[]> {
  const params = new URLSearchParams({
    collection,
    limit: limit.toString(),
    mode: 'review',
  });
  if (excludeWords.length > 0) {
    params.set('excludeWords', excludeWords.join(','));
  }

  params.set('language', getActiveLanguage());
  const res = await apiFetch(`/api/cloze/due?${params}`);
  const sentences = await res.json();
  return sentences.map((s: Record<string, unknown>) => ({
    ...s,
    nextReview: new Date(s.nextReview as string),
    lastReviewed: s.lastReviewed ? new Date(s.lastReviewed as string) : undefined,
  }));
}

export async function getNewSentencesByCollection(
  collection: ClozeCollection,
  limit: number = 20,
  excludeWords: string[] = [],
): Promise<ClozeSentence[]> {
  const params = new URLSearchParams({
    collection,
    limit: limit.toString(),
    mode: 'new',
  });
  if (excludeWords.length > 0) {
    params.set('excludeWords', excludeWords.join(','));
  }

  params.set('language', getActiveLanguage());
  const res = await apiFetch(`/api/cloze/due?${params}`);
  const sentences = await res.json();
  return sentences.map((s: Record<string, unknown>) => ({
    ...s,
    nextReview: new Date(s.nextReview as string),
    lastReviewed: s.lastReviewed ? new Date(s.lastReviewed as string) : undefined,
  }));
}

type CollectionCounts = Record<ClozeCollection, { total: number; due: number; mastered: number }>;

export async function getCollectionCounts(): Promise<CollectionCounts> {
  return cachedQuery(
    activeLanguageQueryKey(CLOZE_QUERY_SCOPE, ['counts']),
    async () => {
      const res = await apiFetch(`/api/cloze/counts${langParam()}`);
      await requireOk(res, 'Could not load practice counts');
      return res.json();
    },
    PERSIST,
  );
}

export function peekCollectionCounts(): CollectionCounts | undefined {
  return peekQuery(activeLanguageQueryKey(CLOZE_QUERY_SCOPE, ['counts']));
}

export async function getStreak(options?: ReadOptions): Promise<StreakStatus> {
  return cachedQuery(
    activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['streak']),
    async () => {
      const res = await apiFetch(`/api/stats/streak${langParam()}`);
      await requireOk(res, 'Could not load the streak');
      return res.json();
    },
    persisted(options),
  );
}

export function peekStreak(): StreakStatus | undefined {
  return peekQuery(activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['streak']));
}

export async function setDailyGoal(goal: DailyGoal): Promise<void> {
  await setSetting('dailyGoal', goal);
  invalidateDailyStats();
}

/** One fluency-radar axis — a topic domain's strength, from the /fluency route. */
export interface DomainAxis {
  domain: string;
  label: string;
  knownCount: number;
  masteryScore: number;
  /** 0–100, log-normalised; what the radar polygon plots. */
  axisValue: number;
  /** Novice | Developing | Strong | Expert. */
  band: string;
}

export interface FluencyStats {
  totalKnownWords: number;
  totalLearning: number;
  totalNew: number;
  byState: Record<WordState, number>;
  estimatedLevel: {
    code: string;
    label: string;
    min: number;
    max: number | null;
  };
  nextLevel: { code: string; label: string } | null;
  progressToNextLevel: number;
  wordsToNextLevel: number | null;
  weeklyGrowth: {
    thisWeek: number;
    lastWeek: number;
    delta: number;
  };
  /** Per-domain strengths for the fluency radar (one entry per fixed taxonomy axis). */
  byDomain: DomainAxis[];
  /** Mastery-state words the background classifier hasn't tagged yet (drains to 0). */
  pending: number;
}

export async function getFluencyStats(
  language: string = getActiveLanguage(),
): Promise<FluencyStats> {
  return cachedQuery(
    activeLanguageQueryKey(FLUENCY_STATS_QUERY_SCOPE, ['fluency'], language),
    async () => {
      const params = new URLSearchParams({ language });
      const res = await apiFetch(`/api/stats/fluency?${params}`);
      await requireOk(res, 'Could not load fluency');
      return res.json();
    },
    PERSIST,
  );
}

export function peekFluencyStats(language: string = getActiveLanguage()): FluencyStats | undefined {
  return peekQuery(activeLanguageQueryKey(FLUENCY_STATS_QUERY_SCOPE, ['fluency'], language));
}

export async function getReadingStats(): Promise<import('./stats-derive').ReadingStats> {
  return cachedQuery(
    activeLanguageQueryKey(READING_STATS_QUERY_SCOPE),
    async () => {
      const res = await apiFetch(`/api/stats/reading${langParam()}`);
      await requireOk(res, 'Could not load reading stats');
      return res.json();
    },
    PERSIST,
  );
}

export function peekReadingStats(): import('./stats-derive').ReadingStats | undefined {
  return peekQuery(activeLanguageQueryKey(READING_STATS_QUERY_SCOPE));
}

// Migration function - no-op for server storage
export async function migrateClozeSentences(): Promise<number> {
  return 0;
}

// ============================================================================
// Helper Functions - Journal
// ============================================================================

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  type: 'grammar' | 'spelling' | 'word_choice' | 'word_order' | 'missing_word' | 'extra_word';
}

export interface JournalEntry {
  id: string;
  body: string;
  correctedBody: string | null;
  corrections: Correction[] | null;
  status: 'draft' | 'submitted';
  wordCount: number;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
}

export async function getJournalEntries(
  limit: number = 20,
  offset: number = 0,
): Promise<JournalEntry[]> {
  return cachedQuery(
    activeLanguageQueryKey(JOURNAL_QUERY_SCOPE, [limit, offset]),
    async () => {
      const res = await apiFetch(`/api/journal?limit=${limit}&offset=${offset}${langParam('&')}`);
      await requireOk(res, 'Could not load your journal');
      return res.json();
    },
    PERSIST,
  );
}

export function peekJournalEntries(
  limit: number = 20,
  offset: number = 0,
): JournalEntry[] | undefined {
  return peekQuery(activeLanguageQueryKey(JOURNAL_QUERY_SCOPE, [limit, offset]));
}

function invalidatingJournal(response: Promise<Response>): Promise<Response> {
  return response.then((res) => {
    if (res.ok) invalidateJournal();
    return res;
  });
}

export async function getJournalEntriesByDate(date: string): Promise<JournalEntry[]> {
  const res = await apiFetch(`/api/journal?date=${date}${langParam('&')}`);
  return res.json();
}

export async function getJournalEntry(id: string): Promise<JournalEntry | undefined> {
  const res = await apiFetch(`/api/journal/${id}`);
  if (!res.ok) return undefined;
  return res.json();
}

export function createJournalEntry(body: string): Promise<Response> {
  const entryDate = new Date().toISOString().split('T')[0];

  return invalidatingJournal(
    apiFetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, entryDate, language: getActiveLanguage() }),
    }),
  );
}

export function updateJournalDraft(id: string, body: string): Promise<Response> {
  return invalidatingJournal(
    apiFetch(`/api/journal/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }),
  );
}

export async function submitJournalForCorrection(
  id: string,
): Promise<{ correctedBody: string; corrections: Correction[] }> {
  const res = await apiFetch(`/api/journal/${id}/correct`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Correction failed');
  }
  invalidateJournal();
  return res.json();
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const res = await apiFetch(`/api/journal/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete journal entry');
  invalidateJournal();
}

// ============================================================================
// Helper Functions - Daily Stats
// ============================================================================

export async function getDailyStats(date: string): Promise<DailyStats | undefined> {
  return cachedQuery(activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['date', date]), async () => {
    const res = await apiFetch(`/api/stats?startDate=${date}&endDate=${date}${langParam('&')}`);
    const stats = await res.json();
    return stats[0];
  });
}

export async function getTodayStats(): Promise<DailyStats> {
  return cachedQuery(
    activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['today']),
    async () => {
      const res = await apiFetch(`/api/stats/today${langParam()}`);
      await requireOk(res, 'Could not load today');
      return res.json();
    },
    PERSIST,
  );
}

export function peekTodayStats(): DailyStats | undefined {
  return peekQuery(activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['today']));
}

export async function incrementDailyStat(
  field: keyof Omit<DailyStats, 'date'>,
  amount: number = 1,
  options: { silentPlanLimit?: boolean } = {},
): Promise<boolean> {
  const res = await apiFetch(`/api/stats/today${langParam()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, amount }),
    silentPlanLimit: options.silentPlanLimit,
  });
  if (res.ok) {
    markActiveScopeStale(DAILY_STATS_QUERY_SCOPE);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DAILY_STATS_EVENT));
  }
  return res.ok;
}

export async function getStatsForDateRange(
  startDate: string,
  endDate: string,
): Promise<DailyStats[]> {
  return cachedQuery(
    activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['range', startDate, endDate]),
    async () => {
      const res = await apiFetch(
        `/api/stats?startDate=${startDate}&endDate=${endDate}${langParam('&')}`,
      );
      return res.json();
    },
  );
}

// All daily-stats rows, oldest first — used by the stats page so the "All" range
// and full-history cumulative series have everything to work with.
export async function getAllDailyStats(): Promise<DailyStats[]> {
  return cachedQuery(
    activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['all']),
    async () => {
      const res = await apiFetch(`/api/stats${langParam()}`);
      await requireOk(res, 'Could not load your stats');
      return res.json();
    },
    PERSIST,
  );
}

export function peekAllDailyStats(): DailyStats[] | undefined {
  return peekQuery(activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['all']));
}

// App-wide activity per date (no language param on purpose, #238) — feeds the
// heatmap so it agrees with the equally app-wide streak.
type AppWideActivity = Pick<
  DailyStats,
  'date' | 'dictionaryLookups' | 'clozePracticed' | 'minutesRead' | 'ankiReviews'
>[];

export async function getAppWideActivity(): Promise<AppWideActivity> {
  return cachedQuery(
    activeTenantQueryKey(DAILY_STATS_QUERY_SCOPE, ['activity']),
    async () => {
      const res = await apiFetch('/api/stats/activity');
      await requireOk(res, 'Could not load activity');
      return res.json();
    },
    PERSIST,
  );
}

export function peekAppWideActivity(): AppWideActivity | undefined {
  return peekQuery(activeTenantQueryKey(DAILY_STATS_QUERY_SCOPE, ['activity']));
}

export async function getRecentStats(days: number = 7): Promise<DailyStats[]> {
  return cachedQuery(
    activeLanguageQueryKey(DAILY_STATS_QUERY_SCOPE, ['recent', days]),
    async () => {
      const res = await apiFetch(`/api/stats?days=${days}${langParam('&')}`);
      return res.json();
    },
  );
}

// Best-effort sync of Anki's per-day review counts into dailyStats.ankiReviews,
// so the activity heatmap + streak reflect Anki study. Returns connected:false
// (a no-op) when AnkiConnect is unreachable. Safe to call on every stats load —
// a closed Anki refuses the connection instantly.
export async function syncAnkiReviews(): Promise<{
  connected: boolean;
  synced: number;
  reviewsToday?: number;
}> {
  const res = await apiFetch('/api/anki/sync-reviews', { method: 'POST' });
  if (!res.ok) return { connected: false, synced: 0 };
  invalidateDailyStats();
  return res.json();
}

// ============================================================================
// Helper Functions - Settings
// ============================================================================

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const res = await apiFetch(`/api/settings/${key}`);
  if (!res.ok) return undefined;
  return res.json();
}

/** Use only where a briefly stale value is harmless, such as page chrome. */
export async function getSettingCached<T>(key: string): Promise<T | undefined> {
  return cachedQuery(
    activeTenantQueryKey(SETTINGS_QUERY_SCOPE, [key]),
    async () => {
      const res = await apiFetch(`/api/settings/${key}`);
      if (res.status === 404) return undefined;
      await requireOk(res, 'Could not load setting');
      return (await res.json()) as T;
    },
    PERSIST,
  );
}

export function peekSettingCached<T>(key: string): T | undefined {
  return peekQuery(activeTenantQueryKey(SETTINGS_QUERY_SCOPE, [key]));
}

export async function setSetting<T>(key: string, value: T): Promise<string> {
  const res = await apiFetch(`/api/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  await requireOk(res, 'Could not save setting');
  invalidateSettings();
  return key;
}

export async function deleteSetting(key: string): Promise<void> {
  const res = await apiFetch(`/api/settings/${key}`, { method: 'DELETE' });
  await requireOk(res, 'Could not delete setting');
  invalidateSettings();
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const res = await apiFetch('/api/settings');
  return res.json();
}

// ============================================================================
// Helper Functions - Word review
// ============================================================================

const REVIEW_GOAL_SETTING_KEY = 'reviewGoal';

/** `fresh` skips the remembered value, for a count that must reflect a save just made. */
export async function getReviewCounts(options: { fresh?: boolean } = {}): Promise<ReviewCounts> {
  return cachedQuery(
    activeLanguageQueryKey(REVIEW_QUERY_SCOPE, ['counts']),
    async () => {
      const res = await apiFetch(`/api/review/counts${langParam()}`);
      await requireOk(res, 'Could not load your review');
      return res.json();
    },
    { ...PERSIST, forceFresh: options.fresh === true },
  );
}

export function peekReviewCounts(): ReviewCounts | undefined {
  return peekQuery(activeLanguageQueryKey(REVIEW_QUERY_SCOPE, ['counts']));
}

export async function getReviewQueue(limit = 20): Promise<ReviewQueue> {
  const res = await apiFetch(`/api/review/queue${langParam()}&limit=${limit}`);
  await requireOk(res, 'Could not load your review');
  return res.json();
}

export async function submitReviewAnswer(input: {
  roundId: string;
  eventId: string;
  cardId: string;
  rawAnswer: ReviewRawAnswer;
  questionType: ReviewQuestionType;
}): Promise<ReviewAnswerResult> {
  const res = await apiFetch(`/api/review/answer${langParam()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(res, 'Could not save your answer');
  invalidateDailyStats();
  invalidateReview();
  return res.json();
}

export async function undoReviewAnswer(input: {
  roundId: string;
  eventId: string;
  newEventId: string;
}): Promise<ReviewAnswerResult> {
  const res = await apiFetch(`/api/review/undo${langParam()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(res, 'Could not change your answer');
  invalidateDailyStats();
  invalidateReview();
  return res.json();
}

export async function getReviewSentenceTranslation(input: {
  roundId: string;
  cardId: string;
}): Promise<SentenceTranslation | null> {
  const res = await apiFetch(`/api/review/sentence-translation${langParam()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(res, 'Could not load the translation');
  const body = (await res.json()) as { translation: SentenceTranslation | null };
  return body.translation ?? null;
}

export async function getReviewExampleSentence(input: {
  roundId: string;
  cardId: string;
}): Promise<ReviewExampleResult> {
  const res = await apiFetch(`/api/review/example-sentence${langParam()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(res, 'Could not load an example');
  return res.json();
}

export async function getReviewGoal(): Promise<ReviewGoal> {
  const value = await getSetting<unknown>(REVIEW_GOAL_SETTING_KEY);
  return value === 'recognize_spell' ? 'recognize_spell' : 'recognize';
}

export async function setReviewGoal(goal: ReviewGoal): Promise<void> {
  await setSetting(REVIEW_GOAL_SETTING_KEY, goal);
}

// ============================================================================
// Helper Functions - Starter Content (#315)
// ============================================================================

export async function getStarterStatus(
  language: string,
): Promise<StarterContentResult & { available: boolean }> {
  const res = await apiFetch(`/api/starter/status?language=${language}`);
  if (!res.ok) return { available: false, seeded: false };
  return res.json();
}

export interface StarterContentResult {
  seeded: boolean;
  reason?: string;
  collectionId?: string;
  lessonCount?: number;
  recommendedLessonId?: string;
  recommendedLessonTitle?: string;
}

/**
 * Copy the language pack's starter collection into the user's library.
 * Idempotent server-side (once per user+language); resolves { seeded: false }
 * rather than throwing when there's nothing to seed or the API errored —
 * language selection must never break on a missing starter pack.
 */
export async function seedStarterContent(language: string): Promise<StarterContentResult> {
  try {
    const res = await apiFetch('/api/starter/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    if (!res.ok) return { seeded: false };
    const result = (await res.json()) as StarterContentResult;
    if (result.seeded) {
      invalidateCollections();
      invalidateReadingStats();
    }
    return result;
  } catch {
    return { seeded: false };
  }
}

// ============================================================================
// Helper Functions - Guided onboarding practice (#331)
// ============================================================================

/**
 * Materialise one idempotent mined cloze card from a word the learner saved in
 * the reader. The API verifies ownership and finds the word's token position;
 * callers never invent a card for another user's vocab row.
 */
export async function createOnboardingCloze(input: {
  vocabId: string;
  word: string;
  sentence: string;
  translation: string;
}): Promise<ClozeSentence | null> {
  const res = await apiFetch('/api/cloze/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, language: getActiveLanguage() }),
  });
  if (!res.ok) return null;
  invalidateCloze();
  const data = await res.json();
  return {
    ...data,
    nextReview: new Date(data.nextReview),
    lastReviewed: data.lastReviewed ? new Date(data.lastReviewed) : undefined,
  };
}

/** Fetch exactly the reader-mined cards named by the onboarding snapshot. */
export async function getOnboardingCloze(vocabIds: string[]): Promise<ClozeSentence[]> {
  if (vocabIds.length === 0) return [];
  const params = new URLSearchParams({
    vocabIds: [...new Set(vocabIds)].slice(0, 20).join(','),
    language: getActiveLanguage(),
  });
  const res = await apiFetch(`/api/cloze/onboarding?${params}`);
  if (!res.ok) return [];
  const sentences = await res.json();
  return sentences.map((sentence: Record<string, unknown>) => ({
    ...sentence,
    nextReview: new Date(sentence.nextReview as string),
    lastReviewed: sentence.lastReviewed ? new Date(sentence.lastReviewed as string) : undefined,
  }));
}

// ============================================================================
// Helper Functions - API Tokens
// ============================================================================

export interface ApiTokenMeta {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface ApiTokenCreateResponse extends ApiTokenMeta {
  token: string;
}

export async function getApiTokens(): Promise<ApiTokenMeta[]> {
  const res = await apiFetch('/api/tokens');
  return res.json();
}

export async function createApiToken(data: {
  name: string;
  scopes: string[];
  expiresAt?: string;
}): Promise<ApiTokenCreateResponse> {
  const res = await apiFetch('/api/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create token');
  }
  return res.json();
}

export async function revokeApiToken(id: string): Promise<void> {
  const res = await apiFetch(`/api/tokens/${id}`, { method: 'DELETE' });
  await requireOk(res, 'Could not revoke API token');
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function exportAllData(): Promise<{
  collections: Collection[];
  vocab: VocabEntry[];
  knownWords: KnownWord[];
  clozeSentences: ClozeSentence[];
  dailyStats: DailyStats[];
  settings: unknown[];
}> {
  const res = await apiFetch('/api/data');
  return res.json();
}

// ============================================================================
// Import from Dexie backup
// ============================================================================

export async function importFromDexie(data: Record<string, unknown[]>): Promise<{
  success: boolean;
  imported: Record<string, number>;
}> {
  const res = await apiFetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await requireOk(res, 'Could not import learning data');
  const result = await res.json();
  const tenant = activeTenantId();
  if (tenant !== null) clearTenantQueries(tenant);
  return result;
}

// ============================================================================
// Helper Functions - Chat
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  createdAt: string;
}

export async function getChatMessages(limit: number = 50, before?: string): Promise<ChatMessage[]> {
  const params = new URLSearchParams({ limit: limit.toString(), language: getActiveLanguage() });
  if (before) params.set('before', before);
  const res = await apiFetch(`/api/chat?${params}`);
  return res.json();
}

export async function sendChatMessage(message: string): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}> {
  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, language: getActiveLanguage() }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to send message');
  }
  return res.json();
}

export async function clearChatMessages(): Promise<void> {
  const res = await apiFetch(`/api/chat${langParam()}`, { method: 'DELETE' });
  await requireOk(res, 'Could not clear chat history');
}

export interface LibraryBook {
  slug: string;
  title: string;
  author: string;
  level: string;
  category: string | null;
  wordCount: number;
  lessonCount: number;
  sourceName: string;
  sourceUrl: string;
  license: string;
  /** Keyed by native-language code. */
  titles: Record<string, string>;
  blurbs: Record<string, string>;
  /** `art` is a painting with no title on it. */
  cover?: { url: string; kind: 'book' | 'art'; credit: string } | null;
  added: boolean;
}

export async function getLibraryCatalog(language: string): Promise<LibraryBook[]> {
  const res = await apiFetch(`/api/library/catalog?language=${encodeURIComponent(language)}`);
  await requireOk(res, 'Could not load the free books');
  return ((await res.json()) as { books: LibraryBook[] }).books;
}

export async function addLibraryBook(language: string, slug: string): Promise<string> {
  const res = await apiFetch('/api/library/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, slug }),
  });
  await requireOk(res, 'Could not add the book');
  invalidateCollections();
  return ((await res.json()) as { collectionId: string }).collectionId;
}

export interface ReadingFeedArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string | null;
  license: string;
  licenseUrl: string;
  publishedAt: string;
  wordCount: number;
  level: string;
}

export async function getReadingFeed(
  language: string,
  interest: string,
): Promise<ReadingFeedArticle[]> {
  const res = await apiFetch(
    `/api/reading-feed?language=${encodeURIComponent(language)}&interest=${encodeURIComponent(interest)}`,
  );
  await requireOk(res, 'Could not load the reading feed');
  return ((await res.json()) as { articles: ReadingFeedArticle[] }).articles;
}

export async function getReadingFeedCached(
  language: string,
  interest: string,
): Promise<ReadingFeedArticle[]> {
  return cachedQuery(
    activeTenantQueryKey(FEED_QUERY_SCOPE, [language, interest]),
    () => getReadingFeed(language, interest),
    PERSIST,
  );
}

export function peekReadingFeed(
  language: string,
  interest: string,
): ReadingFeedArticle[] | undefined {
  return peekQuery(activeTenantQueryKey(FEED_QUERY_SCOPE, [language, interest]));
}

export interface ArticleDescription {
  title: string;
  summary: string;
}

export async function describeReadingFeedArticles(
  ids: string[],
  native: string,
): Promise<Record<string, ArticleDescription>> {
  const res = await apiFetch('/api/reading-feed/describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, native }),
  });
  await requireOk(res, 'Could not describe the articles');
  return ((await res.json()) as { descriptions: Record<string, ArticleDescription> }).descriptions;
}

export async function addReadingFeedArticle(id: string): Promise<string> {
  const res = await apiFetch('/api/reading-feed/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  await requireOk(res, 'Could not add the article');
  invalidateCollections();
  return ((await res.json()) as { collectionId: string }).collectionId;
}
