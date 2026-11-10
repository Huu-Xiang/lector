import { describe, expect, test } from 'bun:test';
import { renderLifecycleEmail } from './lifecycle-copy';
import { LIFECYCLE_TEMPLATES } from './lifecycle-email';
import { resendPayload } from './email';

const vars = {
  USER_NAME: 'Ada',
  LANGUAGE: 'Korean',
  APP_URL: 'https://readfox.app',
  STOP_URL: 'https://readfox.app/api/email/unsubscribe?t=x',
  STARTER_LINE: 'Start with A Short Story.',
  WORD_COUNT: '12',
  PLAN_NAME: 'Plus',
  END_DATE: '12 November 2026',
  REVIEW_COUNT: '8',
};

describe('lifecycle copy', () => {
  for (const alias of Object.values(LIFECYCLE_TEMPLATES)) {
    test(`${alias} renders`, () => {
      const r = renderLifecycleEmail(alias, vars);
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.text).toContain('Ada');
      expect(r.html).toContain('https://readfox.app/');
      expect(r.text).toContain(vars.STOP_URL);
      expect(r.html).toContain(vars.STOP_URL);
      expect(r.html).toContain('Unsubscribe');
      const body = resendPayload('Readfox <support@readfox.app>', {
        to: 'a@b.c',
        ...r,
        meta: { alias, variables: vars },
      });
      expect(body.template).toBeUndefined();
      expect(body.meta).toBeUndefined();
      expect(body.html).toBe(r.html);
    });
  }

  test('the first-week mails open the app, not the public book list', () => {
    for (const alias of [
      LIFECYCLE_TEMPLATES.welcome,
      LIFECYCLE_TEMPLATES.day1,
      LIFECYCLE_TEMPLATES.day3,
    ]) {
      const r = renderLifecycleEmail(alias, vars);
      expect(r.text).toContain('https://readfox.app/login');
      expect(r.html).toContain('href="https://readfox.app/login"');
      expect(r.text).not.toContain('https://readfox.app/books');
    }
  });

  test('an empty starter line leaves no empty paragraph', () => {
    const r = renderLifecycleEmail(LIFECYCLE_TEMPLATES.welcome, { ...vars, STARTER_LINE: '' });
    expect(r.text).not.toContain('\n\n\n');
    expect(r.html).not.toContain('<p style="line-height:1.6"></p>');
  });
});
