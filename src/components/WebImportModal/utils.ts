import type { ExtractedArticle } from './types';
import { apiFetch } from '@/lib/api-base';

export type ExtractResult =
  | { ok: true; data: ExtractedArticle }
  | { ok: false; message: string | null; network?: boolean };

export async function extractArticle(url: string): Promise<ExtractResult> {
  try {
    const response = await apiFetch('/api/extract-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, message: data.error || null };
    }

    return { ok: true, data };
  } catch (error) {
    console.error('Error extracting URL:', error);
    return { ok: false, message: null, network: true };
  }
}
