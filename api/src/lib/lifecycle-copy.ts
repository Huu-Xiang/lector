/**
 * Inline copy for the lifecycle mails. Replaces Resend hosted templates,
 * which were never published on the Readfox account (sends returned 404).
 */
export interface LifecycleVars {
  USER_NAME: string;
  LANGUAGE: string;
  APP_URL: string;
  STOP_URL: string;
  STARTER_LINE: string;
  WORD_COUNT: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  paragraphs: (v: LifecycleVars) => string[];
  cta: string;
  ctaPath: string;
  zh: string;
  stop: boolean;
}

const COPY: Record<string, Copy> = {
  'welcome-on-account-create': {
    subject: 'Welcome to Readfox',
    paragraphs: (v) => [
      `Hi ${v.USER_NAME},`,
      `Thanks for joining Readfox. The quickest way to start: open a free book at your level, tap any word you don't know, and it is saved with its sentence for review.`,
      v.STARTER_LINE,
    ],
    cta: 'Start reading',
    ctaPath: '/books',
    zh: '欢迎加入 Readfox！打开一本适合你水平的免费书，点任意生词即可看到解释，并自动存进生词本。',
    stop: false,
  },
  'day-1-registered-no-word-saved': {
    subject: 'Try tapping one word',
    paragraphs: (v) => [
      `Hi ${v.USER_NAME},`,
      `You haven't saved a word yet. Open any page in ${v.LANGUAGE}, tap a word you don't know, and Readfox explains it in context and keeps it with the sentence you found it in.`,
      v.STARTER_LINE,
    ],
    cta: 'Open a book',
    ctaPath: '/books',
    zh: '还没存过生词？打开任意一页，点一个不认识的词试试，Readfox 会结合上下文解释并保存。',
    stop: true,
  },
  'day-3-registered-no-real-use': {
    subject: 'Ten minutes of reading is enough',
    paragraphs: (v) => [
      `Hi ${v.USER_NAME},`,
      `Reading a little every day beats a long session once a week. Pick a short book at your level and read for ten minutes; tap the words you need.`,
      v.STARTER_LINE,
    ],
    cta: 'Read for 10 minutes',
    ctaPath: '/books',
    zh: '每天读十分钟，比一周读一次长时间更有效。挑一本短书，遇到生词点一下就好。',
    stop: true,
  },
  'anki-after-10-saved-words': {
    subject: (`You have saved 10+ words`),
    paragraphs: (v) => [
      `Hi ${v.USER_NAME},`,
      `You have saved ${v.WORD_COUNT} words so far. Review them with spaced repetition in Readfox, or send them to Anki if you already use it.`,
    ],
    cta: 'Review your words',
    ctaPath: '/practice',
    zh: `你已经存了不少生词，现在用间隔重复复习一下吧，也可以导出到 Anki。`,
    stop: true,
  },
  'gloss-cap-free-tier-limit-hit': {
    subject: "You've used this month's free AI lookups",
    paragraphs: (v) => [
      `Hi ${v.USER_NAME},`,
      `You have reached this month's free AI lookup allowance. The allowance resets next month. If you want more now, a paid plan raises the limit, or you can use your own AI key on paid plans.`,
    ],
    cta: 'See plans',
    ctaPath: '/pricing',
    zh: '本月免费 AI 查词额度已用完。额度下月重置；需要更多可升级套餐。',
    stop: true,
  },
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function hasLifecycleCopy(alias: string): boolean {
  return alias in COPY;
}

export function renderLifecycleEmail(alias: string, v: LifecycleVars): RenderedEmail {
  const c = COPY[alias];
  if (!c) throw new Error(`no lifecycle copy for ${alias}`);
  const base = v.APP_URL.replace(/\/$/, '');
  const url = `${base}${c.ctaPath}`;
  const paras = c.paragraphs(v).filter((p) => p && p.trim());
  const stopText = c.stop ? `\n\nDon't want these emails? / 不想再收到：${v.STOP_URL}` : '';
  const text = `${paras.join('\n\n')}\n\n${c.cta}: ${url}\n\n${c.zh}\n\n— Readfox${stopText}\n`;
  const stopHtml = c.stop
    ? `<p style="font-size:12px;color:#6b6356">Don't want these emails? / 不想再收到？<a href="${esc(v.STOP_URL)}" style="color:#6b6356">Unsubscribe / 退订</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3eee3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2c2a23">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fffdf7;border:1px solid #e9e1d0;border-radius:12px;padding:24px">
<p style="font-weight:800;font-size:18px;margin:0 0 16px">Readfox</p>
${paras.map((p) => `<p style="line-height:1.6">${esc(p)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#2f8a76;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${esc(c.cta)}</a></p>
<p style="line-height:1.6;color:#6b6356">${esc(c.zh)}</p>
</div>
${stopHtml}
</div></body></html>`;
  return { subject: c.subject, text, html };
}
