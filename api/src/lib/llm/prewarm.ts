/**
 * Opt-in keep-warm for the LLM endpoint (LLM_PREWARM=1). A cheap GET
 * keeps one TLS connection in Bun's fetch pool, so the first word lookup
 * after an idle period skips the handshake. It sends no prompt and costs no tokens.
 */
const INTERVAL_MS = 4 * 60_000;
const TIMEOUT_MS = 5_000;

export function prewarmUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.OPENAI_COMPAT_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/v1/models` : null;
}

/** Any HTTP answer counts: the connection is open either way. */
export async function prewarmOnce(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TIMEOUT_MS,
): Promise<boolean> {
  const url = prewarmUrl(env);
  if (!url) return false;
  const headers: Record<string, string> = {};
  if (env.OPENAI_COMPAT_API_KEY) headers.Authorization = `Bearer ${env.OPENAI_COMPAT_API_KEY}`;
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer(); // read to the end so the socket returns to the pool
    return true;
  } catch {
    return false;
  }
}

export function startLlmPrewarm(
  env: NodeJS.ProcessEnv = process.env,
  intervalMs: number = INTERVAL_MS,
): (() => void) | null {
  if (env.LLM_PREWARM !== '1' || !prewarmUrl(env)) return null;
  void prewarmOnce(env);
  const timer = setInterval(() => void prewarmOnce(env), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
