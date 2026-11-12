import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isVocabReportAttemptId } from '../../../languages/en/vocab-report';
import { db } from '../db';
import { config } from '../lib/config';
import { InMemoryExtractionBurstLimiter } from '../lib/rate-limit';
import { LOCAL_USER_ID, resolveUserId } from '../lib/user';
import { deliverVocabReport } from '../lib/vocab-test-report-delivery';
import {
  expireVocabReportDeliveries,
  getVocabReport,
  insertVocabReport,
  listVocabReports,
  parseVocabReportCursor,
  parseVocabReportSnapshot,
  resolveVocabReportBooks,
} from '../lib/vocab-test-report-store';

interface VocabTestReportDeps {
  authRequired: boolean;
  isVerified: (userId: string) => boolean;
  tryWrite: (userId: string) => boolean;
  deliver: (userId: string, attemptId: string) => Promise<void>;
}

export function createVocabTestReportsApp(deps: VocabTestReportDeps) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    if (!deps.authRequired) return c.json({ error: 'Reports require Readfox accounts' }, 404);
    if (c.req.header('Authorization') || c.get('tokenId')) {
      return c.json({ error: 'Reports require a browser session' }, 403);
    }
    let userId: string;
    try {
      userId = resolveUserId(deps.authRequired, c);
    } catch {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (userId === LOCAL_USER_ID) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    c.set('userId', userId);
    if (!deps.isVerified(userId)) {
      return c.json({ error: 'Verify your email before saving a report' }, 403);
    }
    if (
      c.req.method === 'POST' &&
      c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    ) {
      return c.json({ error: 'Expected application/json' }, 415);
    }
    await next();
  });

  app.use(
    '*',
    bodyLimit({
      maxSize: 8192,
      onError: (c) => c.json({ error: 'Report request is too large' }, 413),
    }),
  );

  app.get('/', (c) => {
    const beforeTakenAt = c.req.query('beforeTakenAt');
    const beforeAttemptId = c.req.query('beforeAttemptId');
    const cursor = parseVocabReportCursor(beforeTakenAt, beforeAttemptId);
    if ((beforeTakenAt || beforeAttemptId) && !cursor) {
      return c.json({ error: 'Invalid report history cursor' }, 400);
    }
    return c.json(listVocabReports(c.get('userId'), cursor));
  });

  app.post('/', async (c) => {
    const userId = resolveUserId(deps.authRequired, c);
    expireVocabReportDeliveries(userId);
    const body = await c.req.json().catch(() => null);
    if (body?.expectedUserId !== userId) {
      return c.json({ error: 'The signed-in account changed' }, 409);
    }
    const snapshot = parseVocabReportSnapshot(body?.snapshot);
    if (!snapshot) return c.json({ error: 'Invalid report result' }, 400);
    const existing = getVocabReport(userId, snapshot.attemptId);
    if (existing) return c.json(existing);
    if (!deps.tryWrite(userId)) return c.json({ error: 'Too many report requests' }, 429);

    const books = resolveVocabReportBooks(snapshot);
    if (!books) return c.json({ error: 'Unknown recommended book' }, 400);
    const inserted = insertVocabReport(userId, { snapshot, books }, 'pending');
    if (inserted) await deps.deliver(userId, snapshot.attemptId);
    const report = getVocabReport(userId, snapshot.attemptId);
    if (!report) return c.json({ error: 'Report not found' }, 404);
    return c.json(report, inserted ? 201 : 200);
  });

  app.post('/:attemptId/retry', async (c) => {
    const userId = resolveUserId(deps.authRequired, c);
    expireVocabReportDeliveries(userId);
    const attemptId = c.req.param('attemptId');
    if (!isVocabReportAttemptId(attemptId)) return c.json({ error: 'Report not found' }, 404);
    const body = await c.req.json().catch(() => null);
    if (body?.expectedUserId !== userId) {
      return c.json({ error: 'The signed-in account changed' }, 409);
    }
    const existing = getVocabReport(userId, attemptId);
    if (!existing) return c.json({ error: 'Report not found' }, 404);
    if (
      existing.deliveryStatus === 'sent' ||
      existing.deliveryStatus === 'restored' ||
      existing.deliveryStatus === 'held' ||
      existing.deliveryStatus === 'sending'
    ) {
      return c.json(existing);
    }
    if (!deps.tryWrite(userId)) return c.json({ error: 'Too many report requests' }, 429);
    await deps.deliver(userId, attemptId);
    const report = getVocabReport(userId, attemptId);
    if (!report) return c.json({ error: 'Report not found' }, 404);
    return c.json(report);
  });

  return app;
}

const limiter = new InMemoryExtractionBurstLimiter({
  windowMs: 24 * 60 * 60_000,
  userPerWindow: 12,
});

export default createVocabTestReportsApp({
  authRequired: config.authRequired,
  isVerified: (userId) =>
    !!db.prepare('SELECT 1 FROM user WHERE id = ? AND emailVerified = 1').get(userId),
  tryWrite: (userId) => limiter.tryConsume(userId, null),
  deliver: deliverVocabReport,
});
