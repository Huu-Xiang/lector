#!/usr/bin/env python3
"""Turn Project Gutenberg plain-text files into library book packs.

Usage:
  python3 -I scripts/build-library-books.py --lang fr --raw <dir with pg<ID>.txt> --out languages/fr/content/library

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
    dict(lang="fr", slug="le-premier-livre", id=48011, title="Le Premier Livre (histoire de Remi)",
         author="Albert A. Méras et B. Méras", level="A1", start="", short="Remi",
         extractor="premier_livre", capitalise_headings=True, lesson_words=450),
    dict(lang="fr", slug="entre-nous", id=44157, title="Entre Nous : lectures françaises (première partie)",
         author="Lucie Vos, Jan Ligthart et H. Scheepstra", level="A1", start=r"^II\. Papa se fâche\.",
         short="Entre Nous", stop=r"^\s*LUCIE VOS,\s*$", lesson_words=600,
         subs=[(r"^[ \t]*(\[Musique\]|_\d+e couplet\._|_Refrain\._)[ \t]*$", ""),
               (r"[ \t]*(\}([ \t]*_bis_\.)?|\(_bis_\))", ""),
               (r"^([IVXL]+)\. (.+?)\.?[ \t]*$", lambda m: m[2].upper()),
               (r"^[ \t]*([A-ZÀ-Ý][A-ZÀ-Ý' ,!-]+)\.[ \t]*$", r"\1")]),
    dict(lang="fr", slug="contes-et-legendes", id=18873, title="Contes et légendes (première partie)",
         author="H. A. Guerber", level="A1", start=r"^LES TROIS OURS\.\[1\]", short="Contes et légendes",
         stop=r"^LE POISSON D'OR\.\[13\]",
         subs=[(r"(?s)^\[Note \d+:.*?\][ \t]*$", ""), (r"^([A-ZÀ-Ý' ,-]+)\.\[\d+\][ \t]*$", r"\1")]),
    dict(lang="fr", slug="riquet-a-la-houppe", id=17098, title="Riquet à la Houppe", author="Charles Perrault",
         level="A2", start=r"Il était une fois", short="Riquet à la Houppe",
         cut=r"^Paris\.--Imprimerie"),
    dict(lang="fr", slug="les-malheurs-de-sophie", id=15058, title="Les Malheurs de Sophie",
         author="Comtesse de Ségur", level="A2", start=r"^I--La poupée de cire\.\s*\n\s*\nMa bonne",
         short="Les Malheurs de Sophie",
         subs=[(r"^([IVX]+)--(.+?)\.?[ \t]*$", lambda m: m[2].upper())]),
    dict(lang="fr", slug="abc-petits-contes", id=30117, title="ABC : petits contes", author="Jules Lemaître",
         level="A2", start=r"^ANE\s*$", short="ABC", cut=r"^40840\.--TOURS"),
    dict(lang="fr", slug="lettres-de-mon-moulin", id=36780, title="Lettres de mon moulin", author="Alphonse Daudet",
         level="B1", start=r"^INSTALLATION\s*$", short="Lettres de mon moulin",
         cut=r"^\s*FIN\s*$"),
    dict(lang="fr", slug="le-tour-du-monde-en-80-jours", id=800, title="Le Tour du monde en quatre-vingts jours",
         author="Jules Verne", level="B1", start=r"En l'année 1872", short="Le Tour du monde"),
    dict(lang="fr", slug="les-memoires-d-un-ane", id=12783, title="Les Mémoires d'un âne",
         author="Comtesse de Ségur", level="B1", start=r"^I\s*\n\s*\nLE MARCHE", short="Mémoires d'un âne",
         subs=[(r"^[IVXL]+[ \t]*$", "")]),
    dict(lang="fr", slug="boule-de-suif", id=10746, title="Boule de Suif et autres contes", author="Guy de Maupassant",
         level="B2", start=r"Pendant plusieurs jours de suite", short="Boule de Suif",
         cut=r"^\s*(Table|TABLE)\s*$"),
    dict(lang="fr", slug="candide", id=4650, title="Candide, ou l'optimisme", author="Voltaire",
         level="B2", start=r"Il y avait en Vestphalie", short="Candide"),
    dict(lang="fr", slug="fables-de-la-fontaine", id=56327, title="Fables de La Fontaine (extraits)",
         author="Jean de La Fontaine", level="B2", start=r"LA CIGALE ET LA FOURMI", short="Fables",
         verse=True, max_words=14000),
    dict(lang="fr", slug="trois-contes", id=12065, title="Trois contes", author="Gustave Flaubert",
         level="C1", start=r"Pendant un demi-siècle", short="Trois contes"),
    dict(lang="fr", slug="madame-bovary", id=14155, title="Madame Bovary (début)", author="Gustave Flaubert",
         level="C1", start=r"^PREMIÈRE PARTIE\s*$", short="Madame Bovary", max_words=35000),
    dict(lang="fr", slug="germinal", id=5711, title="Germinal (début)", author="Émile Zola",
         level="C1", start=r"^Première Partie\s*$", short="Germinal", max_words=35000,
         subs=[(r"^(Première|Deuxième|Troisième) Partie[ \t]*$", lambda m: m[0].upper())]),
    dict(lang="fr", slug="du-cote-de-chez-swann", id=2650, title="Du côté de chez Swann (Combray, début)",
         author="Marcel Proust", level="C2", start=r"Longtemps, je me suis couché", short="Combray",
         stop=r"^II\.\s*$"),
    dict(lang="fr", slug="le-pere-goriot", id=55860, title="Le Père Goriot (début)", author="Honoré de Balzac",
         level="C2", start=r"^Madame Vauquer, née de Conflans", short="Le Père Goriot", max_words=35000,
         subs=[(r"(?s)\[Illustration:.*?\]", "")]),
    dict(lang="fr", slug="notre-dame-de-paris", id=19657, title="Notre-Dame de Paris (début)", author="Victor Hugo",
         level="C2", start=r"^LIVRE PREMIER\s*$", short="Notre-Dame de Paris", max_words=35000),
    dict(lang="en", slug="kittens-and-cats", id=61852, title="Kittens and Cats: A First Reader",
         author="Eulalie Osgood Grover", level="A1", start=r"^THE QUEEN\s*$", short="Kittens and Cats",
         cut=r"^A WORD TO THE TEACHER", capitalise_headings=True),
    dict(lang="en", slug="heart-of-darkness", id=219, title="Heart of Darkness",
         author="Joseph Conrad", level="C2", start=r"^I\s*\n\s*\nThe Nellie", short="Heart of Darkness"),
    dict(lang="en", slug="the-tale-of-peter-rabbit", id=14838, title="The Tale of Peter Rabbit",
         author="Beatrix Potter", level="A2", start=r"Once upon a time", short="Peter Rabbit"),
    dict(lang="en", slug="aesops-fables", id=11339, title="Aesop's Fables (selection)",
         author="Aesop, translated by V. S. Vernon Jones", level="A2",
         start=r"THE FOX AND THE GRAPES\s*\n\s*\n(?!\s*THE GOOSE)", short="Aesop's Fables", max_words=14000),
    dict(lang="en", slug="the-wonderful-wizard-of-oz", id=55, title="The Wonderful Wizard of Oz",
         author="L. Frank Baum", level="B1", start=r"Dorothy lived in the midst", short="The Wizard of Oz"),
    dict(lang="en", slug="alices-adventures-in-wonderland", id=11, title="Alice's Adventures in Wonderland",
         author="Lewis Carroll", level="B1", start=r"Alice was beginning to get very tired", short="Alice in Wonderland"),
    dict(lang="en", slug="adventures-of-sherlock-holmes", id=1661, title="The Adventures of Sherlock Holmes",
         author="Arthur Conan Doyle", level="B2", start=r"To Sherlock Holmes she is always", short="Sherlock Holmes"),
    dict(lang="en", slug="pride-and-prejudice", id=1342, title="Pride and Prejudice",
         author="Jane Austen", level="C1", start=r"It is a truth universally acknowledged", short="Pride and Prejudice",
         cut=r"^\s*\[Illustration:\s*$"),
    dict(lang="en", slug="the-summers-primer", id=68453, title="The Summers Readers: Primer",
         author="Maud Summers", level="A1", start=r"^\s*Sing\.\s*$", short="Primer",
         cut=r"^REFERENCES TO THE MANUAL", capitalise_headings=True),
    dict(lang="en", slug="the-summers-first-reader", id=67302, title="The Summers Readers: First Reader",
         author="Maud Summers", level="A1", start=r"^\[Illustration\] THE LITTLE RED APPLE", short="First Reader",
         cut=r"^ALPHABET\.\s*$", capitalise_headings=True,
         subs=[(r"=([^=\n]+)=", r"\1"), (r"^[IVX]+[ \t]*$", "")]),
    dict(lang="en", slug="the-little-red-hen", id=18735, title="The Little Red Hen",
         author="Florence White Williams", level="A2", start=r"^A Little Red Hen lived in a barnyard",
         short="The Little Red Hen", cut=r"^\s*\*\s+\*\s+\*"),
    dict(lang="en", slug="the-happy-prince", id=30120, title="The Happy Prince and Other Tales",
         author="Oscar Wilde", level="B1", start=r"^THE HAPPY PRINCE\s*\n\s*\nHigh above the city",
         short="The Happy Prince", cut=r"^PRINTED BY\s*$", capitalise_headings=True),
    dict(lang="en", slug="black-beauty", id=271, title="Black Beauty",
         author="Anna Sewell", level="B1", start=r"^Part I\s*$", short="Black Beauty",
         subs=[(r"^(\d\d) (.+?)[ \t]*$", lambda m: f"Chapter {int(m[1])}. {m[2]}")]),
    dict(lang="en", slug="treasure-island", id=120, title="Treasure Island",
         author="Robert Louis Stevenson", level="B2", start=r"^PART ONE--The Old Buccaneer", short="Treasure Island",
         subs=[(r"^([IVXL]+)[ \t]*\n(\S.*(?:\n\S.*)*)", lambda m: f"Chapter {m[1]}. " + " ".join(m[2].split()))]),
    dict(lang="en", slug="the-call-of-the-wild", id=215, title="The Call of the Wild",
         author="Jack London", level="B2", start=r"^Chapter I\. Into the Primitive", short="The Call of the Wild"),
    dict(lang="en", slug="a-christmas-carol", id=46, title="A Christmas Carol",
         author="Charles Dickens", level="C1", start=r"^STAVE I:", short="A Christmas Carol"),
    dict(lang="en", slug="the-picture-of-dorian-gray", id=174, title="The Picture of Dorian Gray",
         author="Oscar Wilde", level="C1", start=r"^CHAPTER I\.\s*$", short="Dorian Gray",
         subs=[(r"^CHAPTER ([IVXL]+)\.[ \t]*$", r"Chapter \1.")]),
    dict(lang="en", slug="jane-eyre", id=1260, title="Jane Eyre (Chapters 1–10)",
         author="Charlotte Brontë", level="C1", start=r"^CHAPTER I\s*$", short="Jane Eyre",
         stop=r"^CHAPTER XI\s*$", subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="great-expectations", id=1400, title="Great Expectations (Chapters 1–11)",
         author="Charles Dickens", level="C2", start=r"^Chapter I\.\s*$", short="Great Expectations",
         stop=r"^Chapter XII\.\s*$"),
    dict(lang="en", slug="wuthering-heights", id=768, title="Wuthering Heights (Chapters 1–10)",
         author="Emily Brontë", level="C2", start=r"^CHAPTER I\s*$", short="Wuthering Heights",
         stop=r"^CHAPTER XI\s*$", subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
]

ROMAN = re.compile(r"^[IVXLC]+\.?$")


def words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def body_of(raw: str, start: str, cut: str | None = None, stop: str | None = None) -> str:
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
    if stop:
        first = re.search(stop, text, flags=re.M)
        if first:
            text = text[:first.start()]
    if cut:
        hits = list(re.finditer(cut, text, flags=re.M | re.I))
        if hits:
            text = text[:hits[-1].start()]
    return text


SKIP_SECTIONS = re.compile(
    r"^(ÉTUDE DE MOTS|CONVERSATION|GRAMMAIRE|THÈME|EXERCICES|COMPOSITION|QUESTIONNAIRE|REVUE|"
    r"VOCABULAIRE|PRONONCIATION)\b"
)


def extract_premier_livre(raw: str) -> str:
    """Keep only the story chapters of 'Le Premier Livre' (a 1915 beginner course).

    Each lesson holds word lists, questions, grammar tables and English
    exercises around one short French chapter. The chapter sits under a
    numbered, all-caps heading such as 'II. MÈRE BARBERIN'.
    """
    raw = raw.replace("\r", "")
    a = raw.find("PREMIÈRE LEÇON\n")
    b = raw.find("*** END OF")
    text = raw[a:b]
    out: list[str] = []
    section: list[str] | None = None
    for line in text.splitlines():
        m = re.match(r"^([IVX]+)\. (.+?)\s*$", line)
        if m and m.group(2).upper() == m.group(2):
            title = m.group(2)
            if section is not None:
                out.extend(section)
            section = None
            if not SKIP_SECTIONS.match(title):
                section = [title.strip(), ""]
            continue
        if re.match(r"^[A-ZÉÈÂ' -]*LEÇON\b", line) and line.upper() == line:
            if section is not None:
                out.extend(section)
            section = None
            continue
        if section is not None:
            section.append(line)
    if section is not None:
        out.extend(section)
    body = "\n".join(out)
    body = re.sub(r"\\|·", "", body)
    body = body.replace("[_u]", "").replace("[oe]", "œ").replace("[OE]", "Œ")
    return body


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
        or bool(re.match(r"^(CHAPITRE|Chapitre|CHAPTER|Chapter)\b", plain))


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


def _capitalise_words(text: str) -> str:
    def word(match: re.Match) -> str:
        w = match.group(0)
        i = next((k for k, ch in enumerate(w) if ch.isalpha()), None)
        return w if i is None else w[:i] + w[i].upper() + w[i + 1:].lower()
    return re.sub(r"[^\s\-]+", word, text)


ROMAN_WORD = re.compile(r"\b(?=[ivxlc]{2,}\b)(c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})\b", re.I)


def _keep_roman(cased: str) -> str:
    """Chapter numbers such as II or XIV stay upper case after sentence casing."""
    return ROMAN_WORD.sub(lambda m: m.group(0).upper(), cased)


def titlecase_heading(text: str, capitalise: bool = False) -> str:
    t = text.strip(" _*")
    if capitalise and t.isupper():
        return _keep_roman(_capitalise_words(t))
    m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
    if m:
        rest = _keep_roman(_sentence(m.group(2))) if m.group(2).isupper() else m.group(2)
        return f"{m.group(1)}. {rest}"
    return _keep_roman(_sentence(t)) if t.isupper() else t


def build(book: dict, raw_dir: Path, out_dir: Path) -> None:
    raw = (raw_dir / f"pg{book['id']}.txt").read_text(encoding="utf8", errors="replace")
    if book.get("extractor") == "premier_livre":
        text = unicodedata.normalize("NFC", extract_premier_livre(raw))
    else:
        text = unicodedata.normalize("NFC", body_of(raw, book["start"], book.get("cut"), book.get("stop")))
    for pattern, repl in book.get("subs", ()):
        text = re.sub(pattern, repl, text, flags=re.M)
    lesson_words = book.get("lesson_words", LESSON_WORDS)
    pars = paragraphs(text, book.get("verse", False))
    budget = book.get("max_words")
    lessons: list[list[str]] = [[]]
    count = 0
    total = 0
    for par in pars:
        w = words(par)
        if budget and total + w > budget and count > 0:
            break
        if count >= lesson_words:
            lessons.append([])
            count = 0
        lessons[-1].append(par)
        count += w
        total += w
    while lessons and lessons[-1] and is_heading(lessons[-1][-1]):
        lessons[-1].pop()
    if not lessons[-1] and len(lessons) > 1:
        lessons.pop()
    if len(lessons) > 1 and words("\n".join(lessons[-1])) < lesson_words // 4:
        lessons[-2].extend(lessons.pop())
    book_dir = out_dir / book["slug"]
    if book_dir.exists():
        shutil.rmtree(book_dir)
    book_dir.mkdir(parents=True)
    entries = []
    cap = book.get("capitalise_headings", False)
    for n, chunk in enumerate(lessons, start=1):
        head = next((titlecase_heading(p, cap) for p in chunk[:1] if is_heading(p)), None)
        title = f"{n}. {head}" if head else f"{n}. {book['short']}"
        body = []
        for p in chunk:
            body.append(f"## {titlecase_heading(p, cap)}" if is_heading(p) else p)
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
    ap.add_argument("--lang", required=True, choices=sorted({b["lang"] for b in BOOKS}))
    args = ap.parse_args()
    for book in BOOKS:
        if book["lang"] == args.lang:
            build(book, args.raw, args.out)


if __name__ == "__main__":
    main()
