/**
 * Read-only latency probe. Run inside the production container:
 *   bun run src/scripts/llm-latency-probe.ts [runs]
 * Sends one tiny chat completion per run to each DashScope endpoint with the
 * configured key and flash model. Prints p50 and p95. Never prints the key.
 */
const ENDPOINTS: Record<string, string> = {
  mainland: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  international: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};
const TIMEOUT_MS = 30_000;

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function once(base: string, key: string, model: string): Promise<number> {
  const started = performance.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with: ok' }],
      max_tokens: 4,
      ...extraBody(),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return performance.now() - started;
}

function extraBody(): Record<string, unknown> {
  try {
    return JSON.parse(process.env.OPENAI_COMPAT_EXTRA_BODY || '{}');
  } catch {
    return {};
  }
}

async function main() {
  const key = process.env.OPENAI_COMPAT_API_KEY;
  const model = process.env.OPENAI_COMPAT_FREE_MODEL || process.env.OPENAI_COMPAT_MODEL;
  const runs = Math.max(1, Number(process.argv[2]) || 5);
  if (!key || !model) {
    console.error(
      'Set OPENAI_COMPAT_API_KEY and OPENAI_COMPAT_FREE_MODEL (or OPENAI_COMPAT_MODEL).',
    );
    process.exit(1);
  }
  console.log(`model=${model} runs=${runs} (first run includes the TLS handshake)`);
  for (const [name, base] of Object.entries(ENDPOINTS)) {
    const times: number[] = [];
    let failures = 0;
    for (let i = 0; i < runs; i++) {
      try {
        times.push(await once(base, key, model));
      } catch (err) {
        failures++;
        console.error(`${name} run ${i + 1}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    const sorted = [...times].sort((a, b) => a - b);
    const fmt = (n: number) => (Number.isNaN(n) ? 'n/a' : `${Math.round(n)} ms`);
    console.log(
      `${name.padEnd(14)} ok=${times.length} fail=${failures} p50=${fmt(percentile(sorted, 50))} p95=${fmt(percentile(sorted, 95))}`,
    );
  }
}

if (import.meta.main) await main();
