import { buildLlmsTxt } from '@/lib/llms-txt';

export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
