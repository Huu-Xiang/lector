import type { Metadata } from 'next';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';

export const metadata: Metadata = { title: 'Privacy – Readfox' };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy">
      <p className="text-muted-foreground">Last updated: 14 October 2026</p>
      <p>
        Readfox is a small, independently run service. This page says plainly what we store, who
        else touches your data, and what we can and cannot see.
      </p>

      <H2>What we store</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your email address, optional name, and a salted hash of your password.</li>
        <li>
          The <strong>text</strong> extracted from books and articles you import (titles and
          chapters). We do not keep the original EPUB file.
        </li>
        <li>Your vocabulary, reading progress, practice history, journal entries and settings.</li>
        <li>
          If you add your own AI key, it is stored encrypted (AES-256-GCM). It is never sent back to
          your browser.
        </li>
        <li>
          A session cookie that keeps you signed in, and short-lived server logs (such as IP address
          and request errors) used to keep the service secure and working.
        </li>
      </ul>

      <H2>Who else is involved</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Cloudflare</strong> – DNS, the Turnstile bot check on sign-up, and R2 storage for
          backups.
        </li>
        <li>
          <strong>Resend</strong> – delivers the verification and password-reset emails.
        </li>
        <li>
          <strong>Your AI provider (OpenRouter or Anthropic)</strong> – when you use translation,
          explanations or chat, the text you select, with some surrounding context, is sent to the
          provider using <em>your</em> key. Their privacy terms apply to that data, and the usage is
          billed to you.
        </li>
      </ul>
      <p>We do not run advertising or analytics trackers, and we do not sell your data.</p>

      <H2>What the operator can and cannot see</H2>
      <p>
        The admin dashboard shows account-level numbers only (sign-up date, counts of lessons and
        words, storage used). It has no screen that displays your book text, and it has no
        &ldquo;view as user&rdquo; or per-user export feature.
      </p>
      <p>
        Be aware that the operator still has technical access to the server and its database, so we
        cannot promise that viewing is technically impossible. We do not look at your content. If
        you ask for support and send us an export, we use it only to fix your problem and then
        delete it. Please do not upload material you would not want a server to process.
      </p>

      <H2>Backups</H2>
      <p>
        The database is continuously replicated to Cloudflare R2, which encrypts data at rest. Daily
        snapshots are additionally encrypted with a key kept offline by the operator, and are kept
        for 30 days.
      </p>

      <H2>Your controls</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Export:</strong> Settings → Learning data → Export all learning data downloads
          everything you have stored.
        </li>
        <li>
          <strong>Delete:</strong> Settings → Delete account removes your account and data from the
          live service. Copies in backups disappear as the daily snapshots expire (up to 30 days).
        </li>
        <li>You can remove your AI key at any time in Settings.</li>
      </ul>

      <H2>Children</H2>
      <p>
        Readfox is not directed at children under 13, and we do not knowingly collect their data.
      </p>

      <H2>Changes and contact</H2>
      <p>
        If this policy changes in a meaningful way we will update the date above. Questions or
        requests about your data:{' '}
        <a className="underline" href="mailto:privacy@readfox.app">
          privacy@readfox.app
        </a>
        .
      </p>
    </LegalShell>
  );
}
