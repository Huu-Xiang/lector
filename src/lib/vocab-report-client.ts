import { apiFetch } from './api-base';
import type {
  VocabReport,
  VocabReportCursor,
  VocabReportPage,
  VocabReportSnapshot,
} from '../../languages/en/vocab-report';

const REPORTS_PATH = '/api/vocab-test-reports';

export async function saveVocabReport(
  snapshot: VocabReportSnapshot,
  expectedUserId: string,
): Promise<VocabReport> {
  const response = await apiFetch(REPORTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId, snapshot }),
    silentPlanLimit: true,
  });
  if (!response.ok) throw new Error('Could not save vocabulary report');
  return response.json();
}

export async function listVocabReports(
  cursor?: VocabReportCursor | null,
  signal?: AbortSignal,
): Promise<VocabReportPage> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set('beforeTakenAt', cursor.takenAt);
    params.set('beforeAttemptId', cursor.attemptId);
  }
  const suffix = params.size === 0 ? '' : `?${params.toString()}`;
  const response = await apiFetch(`${REPORTS_PATH}${suffix}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Could not load vocabulary reports');
  return response.json();
}

export async function retryVocabReport(
  attemptId: string,
  expectedUserId: string,
): Promise<VocabReport> {
  const response = await apiFetch(`${REPORTS_PATH}/${encodeURIComponent(attemptId)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId }),
    silentPlanLimit: true,
  });
  if (!response.ok) throw new Error('Could not retry vocabulary report email');
  return response.json();
}
