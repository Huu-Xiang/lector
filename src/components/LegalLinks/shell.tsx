import Image from 'next/image';
import Link from 'next/link';
import LegalLinks from '@/components/LegalLinks';

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2" title="Readfox">
        <Image src="/logo.png" alt="Readfox" width={36} height={36} className="rounded" />
        <span className="text-xl font-extrabold tracking-tight text-foreground">Readfox</span>
      </Link>
      <article className="w-full max-w-2xl space-y-5 text-sm leading-relaxed text-foreground">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {children}
      </article>
      <LegalLinks className="mt-10" />
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-3 text-lg font-semibold">{children}</h2>;
}
