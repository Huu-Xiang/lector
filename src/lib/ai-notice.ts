const AI_PATHS = [
  /^\/api\/explain$/,
  /^\/api\/translate(\/|$)/,
  /^\/api\/journal\/[^/]+\/correct$/,
  /^\/api\/review\/(sentence-translation|example-sentence)$/,
];

/** True for a call that sends the user's text to the third-party AI provider. */
export function isAiRequest(path: string, method = 'GET'): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const route = path.split('?')[0];
  return route === '/api/chat' || AI_PATHS.some((pattern) => pattern.test(route));
}

export interface AiNoticeDeps {
  readAcceptedAt: () => Promise<string | null>;
  showNotice: () => Promise<boolean>;
  saveAcceptedAt: (at: string) => Promise<void>;
  now?: () => Date;
}

/** Resolves true once the account agreed to the notice. A decline resolves false and asks again. */
export function createAiNoticeGate(deps: AiNoticeDeps): () => Promise<boolean> {
  let accepted = false;
  let pending: Promise<boolean> | null = null;

  async function run(): Promise<boolean> {
    if (await deps.readAcceptedAt()) return true;
    if (!(await deps.showNotice())) return false;
    await deps.saveAcceptedAt((deps.now?.() ?? new Date()).toISOString());
    return true;
  }

  return async () => {
    if (accepted) return true;
    pending ??= run().finally(() => {
      pending = null;
    });
    accepted = await pending;
    return accepted;
  };
}
