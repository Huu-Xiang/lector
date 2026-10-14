#!/usr/bin/env python3
"""Turn Project Gutenberg plain-text files into library book packs.

Usage:
  python3 -I scripts/build-library-books.py --raw <dir with pg<ID>.txt> --out languages/fr/content/library

Each book becomes <out>/<slug>/manifest.json plus NN.md lesson files of about
LESSON_WORDS words, cut at paragraph boundaries. The raw files are never committed.
"""
import argparse
import json
import re
import shutil
import unicodedata
from pathlib import Path

LESSON_WORDS = 1400

BOOKS = [
    dict(slug="riquet-a-la-houppe", id=17098, title="Riquet à la Houppe", author="Charles Perrault",
         level="A2", start=r"Il était une fois", short="Riquet à la Houppe",
         cut=r"^Paris\.--Imprimerie"),
    dict(slug="lettres-de-mon-moulin", id=36780, title="Lettres de mon moulin", author="Alphonse Daudet",
         level="B1", start=r"^INSTALLATION\s*$", short="Lettres de mon moulin",
         cut=r"^\s*FIN\s*$"),
    dict(slug="le-tour-du-monde-en-80-jours", id=800, title="Le Tour du monde en quatre-vingts jours",
         author="Jules Verne", level="B1", start=r"En l'année 1872", short="Le Tour du monde"),
    dict(slug="boule-de-suif", id=10746, title="Boule de Suif et autres contes", author="Guy de Maupassant",
         level="B2", start=r"Pendant plusieurs jours de suite", short="Boule de Suif",
         cut=r"^\s*(Table|TABLE)\s*$"),
    dict(slug="candide", id=4650, title="Candide, ou l'optimisme", author="Voltaire",
         level="B2", start=r"Il y avait en Vestphalie", short="Candide"),
    dict(slug="fables-de-la-fontaine", id=56327, title="Fables de La Fontaine (extraits)",
         author="Jean de La Fontaine", level="B2", start=r"LA CIGALE ET LA FOURMI", short="Fables",
         verse=True, max_words=14000),
    dict(slug="trois-contes", id=12065, title="Trois contes", author="Gustave Flaubert",
         level="C1", start=r"Pendant un demi-siècle", short="Trois contes"),
]

ROMAN = re.compile(r"^[IVXLC]+\.?$")


def words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def body_of(raw: str, start: str, cut: str | None = None) -> str:
    raw = raw.replace("\r", "")
    a = raw.find("*** START OF")
    a = raw.find("\n", a) + 1 if a != -1 else 0
    b = raw.find("*** END OF")
    text = raw[a:b if b != -1 else len(raw)]
    m = re.search(start, text, flags=re.M)
    if not m:
        raise SystemExit(f"start marker not found: {start}")
    text = text[m.start():]
    tail = re.search(r"^End of (the )?Project Gutenberg", text, flags=re.M | re.I)
    if tail:
        text = text[:tail.start()]
    if cut:
        hits = list(re.finditer(cut, text, flags=re.M | re.I))
        if hits:
            text = text[:hits[-1].start()]
    return text


def clean_paragraph(par: str, verse: bool) -> str | None:
    par = par.strip("\n")
    if not par.strip():
        return None
    first = par.strip().splitlines()[0].strip()
    if re.match(r"^\[(Illustration|Pg|Page)", first, flags=re.I) and "\n" not in par.strip():
        return None
    if re.match(r"^\[\d+\]", first):
        return None  # footnote text
    par = re.sub(r"\[Illustration[^\]]*\]", "", par)
    par = re.sub(r"\[\d+\]", "", par)
    par = par.replace("--", "—")
    lines = [ln.strip() for ln in par.splitlines() if ln.strip()]
    if not lines:
        return None
    if verse and len(lines) > 1:
        return "  \n".join(lines)
    return re.sub(r"\s+", " ", " ".join(lines))


def is_heading(par: str) -> bool:
    if "\n" in par or len(par) > 80:
        return False
    plain = par.strip(" _*.")
    return bool(ROMAN.match(plain)) or (len(plain) > 2 and plain == plain.upper() and re.search(r"[A-ZÀ-Ý]", plain)) \
        or bool(re.match(r"^(CHAPITRE|Chapitre)\b", plain))


def paragraphs(text: str, verse: bool) -> list[str]:
    out: list[str] = []
    for chunk in re.split(r"\n\s*\n", text):
        par = clean_paragraph(chunk, verse)
        if par:
            out.append(par)
    merged: list[str] = []
    for par in out:
        if merged and is_heading(par) and ROMAN.match(merged[-1].strip(" _*.")):
            merged[-1] = f"{merged[-1].strip(' _*.')}. {par.strip(' _*')}"
        else:
            merged.append(par)
    return merged


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:].lower()


def titlecase_heading(text: str) -> str:
    t = text.strip(" _*")
    m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
    if m:
        return f"{m.group(1)}. {_sentence(m.group(2)) if m.group(2).isupper() else m.group(2)}"
    return _sentence(t) if t.isupper() else t


def build(book: dict, raw_dir: Path, out_dir: Path) -> None:
    raw = (raw_dir / f"pg{book['id']}.txt").read_text(encoding="utf8", errors="replace")
    text = unicodedata.normalize("NFC", body_of(raw, book["start"], book.get("cut")))
    pars = paragraphs(text, book.get("verse", False))
    budget = book.get("max_words")
    lessons: list[list[str]] = [[]]
    count = 0
    total = 0
    for par in pars:
        w = words(par)
        if budget and total + w > budget and count > 0:
            break
        if count >= LESSON_WORDS:
            lessons.append([])
            count = 0
        lessons[-1].append(par)
        count += w
        total += w
    if len(lessons) > 1 and words("\n".join(lessons[-1])) < LESSON_WORDS // 4:
        lessons[-2].extend(lessons.pop())
    book_dir = out_dir / book["slug"]
    if book_dir.exists():
        shutil.rmtree(book_dir)
    book_dir.mkdir(parents=True)
    entries = []
    for n, chunk in enumerate(lessons, start=1):
        head = next((titlecase_heading(p) for p in chunk[:1] if is_heading(p)), None)
        title = f"{n}. {head}" if head else f"{n}. {book['short']}"
        body = []
        for p in chunk:
            body.append(f"## {titlecase_heading(p)}" if is_heading(p) else p)
        name = f"{n:02d}.md"
        (book_dir / name).write_text(f"# {title}\n\n" + "\n\n".join(body) + "\n", encoding="utf8")
        entries.append({"file": name, "title": title})
    manifest = {
        "title": book["title"],
        "author": book["author"],
        "level": book["level"],
        "wordCount": total,
        "source": {
            "name": "Project Gutenberg",
            "url": f"https://www.gutenberg.org/ebooks/{book['id']}",
            "license": "Public domain in the United States",
        },
        "lessons": entries,
    }
    (book_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{book['slug']}: {len(entries)} lessons, {total} words")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    for book in BOOKS:
        build(book, args.raw, args.out)


if __name__ == "__main__":
    main()
