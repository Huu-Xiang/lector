import AdmZip from 'adm-zip';
import path from 'path';
import { htmlToMarkdown, countWords } from './html-to-markdown';
import { normalizeText, type LanguageConfig } from './languages';

export interface EpubChapter {
  title: string;
  markdown: string;
  wordCount: number;
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: EpubChapter[];
}

// Bound decompression so a zip bomb (a tiny archive that inflates to gigabytes)
// can't exhaust memory when we call getData()/readAsText() below. We check the
// declared uncompressed sizes from the central directory before inflating.
const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * `pack` is the language the chapters will be imported as. It only affects
 * `wordCount` (#289 4.6): an unspaced-CJK EPUB counts segmenter tokens, every
 * other script keeps the whitespace count. Omitting it gives the spaced count.
 */
export function parseEpub(buffer: Buffer, pack?: LanguageConfig): ParsedEpub {
  const zip = new AdmZip(buffer);

  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) {
    throw new Error('EPUB has too many entries');
  }
  let declaredBytes = 0;
  for (const entry of entries) {
    // adm-zip only bounds inflation by a non-zero declared size.
    if (!entry.isDirectory && entry.header.size === 0 && entry.header.compressedSize > 0) {
      throw new Error('EPUB has an entry without a declared size');
    }
    declaredBytes += entry.header.size;
    if (declaredBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('EPUB content exceeds the size limit');
    }
  }

  const containerXml = zip.readAsText('META-INF/container.xml');
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) {
    throw new Error('Could not find OPF file path in container.xml');
  }
  const opfPath = opfPathMatch[1];
  const opfDir = path.dirname(opfPath);

  const opfXml = zip.readAsText(opfPath);

  // Text ingress (#289): chapter markdown is normalized inside htmlToMarkdown;
  // metadata and TOC titles come straight from the XML, so normalize here.
  const title = normalizeText(
    extractTag(opfXml, 'dc:title') || extractTag(opfXml, 'title') || 'Untitled',
  );
  const author = normalizeText(
    extractTag(opfXml, 'dc:creator') || extractTag(opfXml, 'creator') || 'Unknown',
  );

  const manifest = new Map<string, string>();
  for (const tag of opfXml.match(/<item\s[^<>]*>/g) ?? []) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    const href = tag.match(/\shref="([^"]+)"/)?.[1];
    if (id && href && !manifest.has(id)) manifest.set(id, href);
  }

  const spineItemRefs = new Set<string>();
  for (const tag of opfXml.match(/<itemref\s[^<>]*>/g) ?? []) {
    const idref = tag.match(/\sidref="([^"]+)"/)?.[1];
    if (idref) spineItemRefs.add(idref);
  }

  const chapters: EpubChapter[] = [];
  let markdownBytes = 0;
  const tocTitles = parseToc(zip, opfXml, manifest, opfDir);

  for (const itemRef of spineItemRefs) {
    const href = manifest.get(itemRef);
    if (!href) continue;

    const filePath = opfDir !== '.' ? `${opfDir}/${href}` : href;
    const entry = zip.getEntry(filePath) || zip.getEntry(href);
    if (!entry) continue;

    const xhtml = entry.getData().toString('utf-8');

    const bodyHtml = bodyOf(xhtml);

    const markdown = htmlToMarkdown(bodyHtml).trim();
    if (!markdown || markdown.length < 10) continue;

    const headingMatch = markdown.match(/^#+\s+(.+)$/m);
    const tocTitle = tocTitles.get(href);
    const chapterTitle = normalizeText(
      tocTitle || headingMatch?.[1] || `Chapter ${chapters.length + 1}`,
    );

    chapters.push({ title: chapterTitle, markdown, wordCount: countWords(markdown, pack) });
    markdownBytes += markdown.length;
    if (markdownBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('EPUB content exceeds the size limit');
    }
  }

  return { title, author, chapters };
}

function bodyOf(xhtml: string): string {
  const lower = xhtml.toLowerCase();
  const open = lower.indexOf('<body');
  const close = lower.lastIndexOf('</body>');
  if (open === -1 || close === -1) return xhtml;
  const start = xhtml.indexOf('>', open);
  return start === -1 || start > close ? xhtml : xhtml.slice(start + 1, close);
}

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^<>]*>([^<]+)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function parseToc(
  zip: AdmZip,
  opfXml: string,
  manifest: Map<string, string>,
  opfDir: string,
): Map<string, string> {
  const titles = new Map<string, string>();

  const ncxMatch =
    opfXml.match(/<item[^<>]*id="ncx"[^<>]*href="([^"]+)"[^<>]*\/?>/i) ||
    opfXml.match(/<item[^<>]*href="([^"]+)"[^<>]*id="ncx"[^<>]*\/?>/i) ||
    opfXml.match(
      /<item[^<>]*media-type="application\/x-dtbncx\+xml"[^<>]*href="([^"]+)"[^<>]*\/?>/i,
    ) ||
    opfXml.match(
      /<item[^<>]*href="([^"]+)"[^<>]*media-type="application\/x-dtbncx\+xml"[^<>]*\/?>/i,
    );

  if (ncxMatch) {
    const ncxPath = opfDir !== '.' ? `${opfDir}/${ncxMatch[1]}` : ncxMatch[1];
    const ncxEntry = zip.getEntry(ncxPath) || zip.getEntry(ncxMatch[1]);
    if (ncxEntry) {
      const ncxXml = ncxEntry.getData().toString('utf-8');
      for (const navPoint of ncxXml.split(/<navPoint\b/).slice(1)) {
        const text = navPoint.match(/<text>([^<]+)<\/text>/)?.[1];
        const src = navPoint.match(/<content\s+src="([^"]+)"/)?.[1];
        if (text && src) titles.set(src.split('#')[0], text.trim());
      }
    }
  }

  if (titles.size === 0) {
    const navMatch =
      opfXml.match(/<item[^<>]*properties="nav"[^<>]*href="([^"]+)"[^<>]*\/?>/i) ||
      opfXml.match(/<item[^<>]*href="([^"]+)"[^<>]*properties="nav"[^<>]*\/?>/i);

    if (navMatch) {
      const navPath = opfDir !== '.' ? `${opfDir}/${navMatch[1]}` : navMatch[1];
      const navEntry = zip.getEntry(navPath) || zip.getEntry(navMatch[1]);
      if (navEntry) {
        const navHtml = navEntry.getData().toString('utf-8');
        const linkRegex = /<a\s+[^<>]*href="([^"]+)"[^<>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = linkRegex.exec(navHtml)) !== null) {
          const src = match[1].split('#')[0];
          titles.set(src, match[2].trim());
        }
      }
    }
  }

  return titles;
}
