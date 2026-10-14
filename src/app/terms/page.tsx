import type { Metadata } from 'next';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';

export const metadata: Metadata = { title: 'Terms – Readfox' };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of use">
      <p className="text-muted-foreground">Last updated: 14 October 2026</p>
      <p>
        By creating an account or using Readfox you agree to these terms. Readfox is run by an
        individual as a hobby-scale service.
      </p>

      <H2>Your content</H2>
      <p>
        You keep ownership of what you import. Only import text you have the right to use for
        personal study. You are responsible for the content you upload, and we may remove content or
        suspend accounts that infringe others&apos; rights or abuse the service.
      </p>

      <H2>Limits</H2>
      <p>
        Each account can store up to 100 MB of imported lesson text. Audio and podcast import are
        not offered. AI features work with a key you provide; the cost of using that key is yours.
      </p>

      <H2>Acceptable use</H2>
      <p>
        Do not attack, overload or probe the service, create accounts in bulk, share your account,
        or use it to break the law.
      </p>

      <H2>No warranty</H2>
      <p>
        The service is provided &ldquo;as is&rdquo;, without guarantees of availability or fitness
        for a purpose. Translations come from AI models and can be wrong. We make backups but you
        should export your data from time to time. To the extent the law allows, we are not liable
        for lost data or indirect losses.
      </p>

      <H2>Changes and termination</H2>
      <p>
        We may change or end the service, and will try to give notice. You can delete your account
        at any time.
      </p>

      <H2>Open source</H2>
      <p>
        The software is licensed under the GNU AGPL-3.0. See the About page for the source code.
      </p>
      <p>
        Contact:{' '}
        <a className="underline" href="mailto:privacy@readfox.app">
          privacy@readfox.app
        </a>
      </p>
    </LegalShell>
  );
}
