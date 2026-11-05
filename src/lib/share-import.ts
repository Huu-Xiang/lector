const PENDING_KEY = 'readfox-pending-share';

export interface ShareStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The link when it is http or https; anything else is never requested. */
export function parseSharedUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function browserStorage(): ShareStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Keeps a shared link across the sign-in screen. */
export function rememberPendingShare(raw: string | null, storage = browserStorage()): void {
  const url = parseSharedUrl(raw);
  if (url) storage?.setItem(PENDING_KEY, url);
}

export function peekPendingShare(storage = browserStorage()): string | null {
  return parseSharedUrl(storage?.getItem(PENDING_KEY));
}

export function clearPendingShare(storage = browserStorage()): void {
  storage?.removeItem(PENDING_KEY);
}

export type ShareResult = { ok: true; lessonId: string } | { ok: false; message: string | null };

interface ShareDeps {
  extract: (
    url: string,
  ) => Promise<
    | { ok: true; data: { title: string; author: string | null; content: string } }
    | { ok: false; message: string | null }
  >;
  create: (data: {
    title: string;
    author: string;
    textContent: string;
  }) => Promise<{ collectionId: string; lessonId: string }>;
}

/** Extracts the article at `url` and saves it as one lesson in the active language. */
export async function importSharedArticle(url: string, deps: ShareDeps): Promise<ShareResult> {
  const extracted = await deps.extract(url);
  if (!extracted.ok) return { ok: false, message: extracted.message };
  try {
    const { lessonId } = await deps.create({
      title: extracted.data.title,
      author: extracted.data.author ?? '',
      textContent: extracted.data.content,
    });
    return { ok: true, lessonId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : null };
  }
}
