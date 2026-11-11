import { apiFetch } from './api-base';
import { activeTenantId } from './language-cache';
import { cachedQuery, invalidateQueries, peekQuery, type QueryKey } from './query-cache';

export const APPROXIMATE_LEVELS = [
  'new',
  'beginner',
  'intermediate',
  'advanced',
  'not_sure',
] as const;

export type ApproximateLevel = (typeof APPROXIMATE_LEVELS)[number];

export const LEARNER_INTERESTS = [
  'everyday-life',
  'culture',
  'current-events',
  'literature',
  'faith-and-theology',
  'travel',
] as const;

export type LearnerInterest = (typeof LEARNER_INTERESTS)[number];
export type OnboardingStatus = 'in_progress' | 'completed' | 'skipped';
export type OnboardingStep = 'reader' | 'practice' | 'summary';

export type LearnerEventType =
  | 'onboarding.started'
  | 'onboarding.profile_saved'
  | 'onboarding.skipped'
  | 'lesson.opened'
  | 'reader.term_looked_up'
  | 'vocab.saved'
  | 'vocab.state_changed'
  | 'practice.answer_submitted'
  | 'practice.round_completed'
  | 'onboarding.completed';

export interface LearnerProfile {
  language: string;
  approximateLevel: ApproximateLevel;
  interests: LearnerInterest[];
  dailyMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  version: number;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  language: string;
  starterCollectionId: string | null;
  recommendedLessonId: string | null;
  recommendedLessonTitle: string | null;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface LearnerEvent {
  id: string;
  eventType: LearnerEventType;
  language: string;
  lessonId: string | null;
  vocabId: string | null;
  properties: Record<string, unknown>;
  occurredAt: string;
}

export interface OnboardingSnapshot {
  progress: OnboardingProgress | null;
  profile: LearnerProfile | null;
  events: LearnerEvent[];
}

export interface StartOnboardingInput {
  language: string;
  approximateLevel: ApproximateLevel;
  interests: LearnerInterest[];
  dailyMinutes: number;
  starterCollectionId?: string;
  recommendedLessonId?: string;
  recommendedLessonTitle?: string;
}

async function jsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error || fallback);
}

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding');
  return jsonOrThrow<OnboardingSnapshot>(response, 'Could not load onboarding progress');
}

export const ONBOARDING_QUERY_SCOPE = 'onboarding';

function onboardingQueryKey(): QueryKey | null {
  const tenant = activeTenantId();
  return tenant === null ? null : { tenant, scope: ONBOARDING_QUERY_SCOPE };
}

function invalidateOnboarding(): void {
  const tenant = activeTenantId();
  if (tenant !== null) invalidateQueries({ tenant, scope: ONBOARDING_QUERY_SCOPE });
}

export async function getOnboardingSnapshotCached(): Promise<OnboardingSnapshot> {
  return cachedQuery(onboardingQueryKey(), getOnboardingSnapshot, { persist: true });
}

export function peekOnboardingSnapshot(): OnboardingSnapshot | undefined {
  return peekQuery(onboardingQueryKey());
}

async function changedSnapshot(response: Response, fallback: string): Promise<OnboardingSnapshot> {
  const snapshot = await jsonOrThrow<OnboardingSnapshot>(response, fallback);
  invalidateOnboarding();
  return snapshot;
}

export async function startOnboarding(input: StartOnboardingInput): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return changedSnapshot(response, 'Could not start the guided session');
}

export async function skipOnboarding(
  input: Pick<StartOnboardingInput, 'language' | 'approximateLevel' | 'interests' | 'dailyMinutes'>,
): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return changedSnapshot(response, 'Could not skip the guided session');
}

/** End the in-reader guide early. The server keeps the saved profile. */
export async function dismissOnboarding(): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding/dismiss', { method: 'POST' });
  return changedSnapshot(response, 'Could not skip the guide');
}

export async function updateOnboardingProgress(input: {
  currentStep?: OnboardingStep;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
}): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return changedSnapshot(response, 'Could not update onboarding progress');
}

export async function completeOnboarding(): Promise<OnboardingSnapshot> {
  const response = await apiFetch('/api/onboarding/complete', { method: 'POST' });
  return changedSnapshot(response, 'Could not complete onboarding');
}

export async function recordLearnerEvent(input: {
  eventType: LearnerEventType;
  language: string;
  lessonId?: string;
  vocabId?: string;
  properties?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ recorded: boolean; event: LearnerEvent }> {
  const response = await apiFetch('/api/learner-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await jsonOrThrow<{ recorded: boolean; event: LearnerEvent }>(
    response,
    'Could not record learning activity',
  );
  invalidateOnboarding();
  return result;
}

export function onboardingEvents(snapshot: OnboardingSnapshot | null): LearnerEvent[] {
  if (!snapshot?.progress) return [];
  const startedAt = new Date(snapshot.progress.startedAt).getTime();
  return snapshot.events.filter((event) => {
    const properties = event.properties as { source?: unknown };
    return properties.source === 'onboarding' && new Date(event.occurredAt).getTime() >= startedAt;
  });
}

/** Words saved in the starter lesson before the guided practice opens. */
export const ONBOARDING_SAVE_TARGET = 1;

export function savedOnboardingWords(
  snapshot: OnboardingSnapshot | null,
): Array<{ id: string; text: string }> {
  const words = new Map<string, string>();
  for (const event of onboardingEvents(snapshot)) {
    if (event.eventType !== 'vocab.saved' || !event.vocabId) continue;
    const text = typeof event.properties.text === 'string' ? event.properties.text : '';
    if (text) words.set(event.vocabId, text);
  }
  return [...words].map(([id, text]) => ({ id, text }));
}

export function encounteredOnboardingTerms(snapshot: OnboardingSnapshot | null): string[] {
  const terms = new Set<string>();
  for (const event of onboardingEvents(snapshot)) {
    if (event.eventType !== 'reader.term_looked_up') continue;
    const term = typeof event.properties.term === 'string' ? event.properties.term : '';
    if (term) terms.add(term);
  }
  return [...terms];
}

export function hasOnboardingPhraseLookup(snapshot: OnboardingSnapshot | null): boolean {
  return onboardingEvents(snapshot).some((event) => {
    if (event.eventType !== 'reader.term_looked_up') return false;
    if (event.properties.kind === 'phrase') return true;
    const term = typeof event.properties.term === 'string' ? event.properties.term.trim() : '';
    return /\s/u.test(term);
  });
}
