import type { Metadata } from 'next';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import { SOURCE_URL } from '@/components/LegalLinks';

export const metadata: Metadata = { title: 'About – Readfox' };

export default function AboutPage() {
  return (
    <LegalShell title="About Readfox">
      <p>
        Readfox lets you read real books and articles in the language you are learning, translate
        words and phrases as you go, and turn what you meet into spaced-repetition practice.
      </p>

      <H2>Free software</H2>
      <p>
        Readfox is free software under the{' '}
        <a
          className="underline"
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          GNU Affero General Public License v3.0
        </a>
        . It is based on{' '}
        <a
          className="underline"
          href="https://github.com/heuwels/lector"
          target="_blank"
          rel="noopener noreferrer"
        >
          Lector
        </a>{' '}
        by heuwels and its contributors, with our modifications.
      </p>
      <p>
        The complete source code of the version running on this site is available at{' '}
        <a className="underline" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {SOURCE_URL}
        </a>
        .
      </p>

      <H2>Data sources</H2>
      <p>
        Sentence banks come from Tatoeba (CC BY 2.0 FR) and dictionaries from the sources listed in
        the repository README, each under its own licence.
      </p>
    </LegalShell>
  );
}
