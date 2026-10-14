import Link from 'next/link';

export const SOURCE_URL = 'https://github.com/Huu-Xiang/lector';

export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground ${className}`}
    >
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        Terms
      </Link>
      <Link href="/about" className="hover:text-foreground hover:underline">
        About
      </Link>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground hover:underline"
      >
        Source code
      </a>
    </nav>
  );
}
