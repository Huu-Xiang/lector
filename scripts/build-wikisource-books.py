#!/usr/bin/env python3
"""Turn Korean Wikisource pages into library book packs.

Usage:
  python3 -I scripts/build-wikisource-books.py --raw <dir> --out languages/ko/content/library [--fetch] [--only slug,slug]

Each book lists Wikisource page titles. `--fetch` downloads their wikitext into
<raw>/<slug>/NNN.wiki (one request per page, throttled); without it the build
reads that cache. The raw files are never committed. The output matches
build-library-books.py: <out>/<slug>/manifest.json plus NN.md lesson files.
"""
import argparse
import json
import re
import shutil
import subprocess
import time
import unicodedata
import urllib.parse
from pathlib import Path

UA = "readfox-library-build/1.0"
WIKI = "https://ko.wikisource.org"
LICENSE = "Public domain (the author died more than 70 years ago); Wikisource transcription CC BY-SA 4.0"
LESSON_WORDS = 650


def pages(prefix: str, numeric: bool = False) -> dict:
    return dict(prefix=prefix, numeric=numeric)


BOOKS = [
    dict(slug="sarang-seonmul", title="사랑의 선물", author="방정환 (편역)", level="B1", short="사랑의 선물",
         prefix="사랑의 선물/", exclude=("한레네의 죽음", "마음의 꽃"), by_page=True,
         order=["산드룡의 유리 구두", "왕자와 제비", "잠자는 왕녀", "꽃 속의 작은이", "어린 음악가", "난파선", "요술왕 아아", "천당가는 길", "한네레의 죽음"],
         page="사랑의 선물"),
    dict(slug="chilchildan-bimil", title="칠칠단의 비밀", author="방정환", level="B2", short="칠칠단의 비밀",
         prefix="칠칠단의 비밀/", numeric=True, page="칠칠단의 비밀", lesson_words=800),
    dict(slug="jindallaekkot", title="진달래꽃", author="김소월", level="B2", short="김소월 시",
         prefix="진달래꽃 (시집)/", verse=True, page="진달래꽃 (시집)", lesson_words=260),
    dict(slug="nimui-chimmuk", title="님의 침묵", author="한용운", level="C1", short="한용운 시",
         prefix="님의 침묵/", verse=True, order=["군말"], page="님의 침묵", lesson_words=300),
    dict(slug="dongbaekkkot", title="동백꽃", author="김유정", level="B2", short="동백꽃", single="동백꽃", page="동백꽃", lesson_words=700),
    dict(slug="unsu-joeun-nal", title="운수 좋은 날", author="현진건", level="B2", short="운수 좋은 날", single="운수 좋은 날", page="운수 좋은 날", lesson_words=700),
    dict(slug="gamja", title="감자", author="김동인", level="C1", short="감자", single="감자", page="감자", lesson_words=700),
    dict(slug="memilkkot-pil-muryeop", title="메밀꽃 필 무렵", author="이효석", level="C1", short="메밀꽃 필 무렵", single="메밀꽃 필 무렵", page="메밀꽃 필 무렵", lesson_words=700),
]


def curl(url: str) -> str:
    for attempt in range(6):
        out = subprocess.run(["curl", "-s", "-m", "60", "-A", UA, url], capture_output=True)
        if out.returncode == 0 and out.stdout:
            return out.stdout.decode()
        time.sleep(3 * (attempt + 1))
    raise SystemExit(f"download failed: {url}")


def list_prefix(prefix: str) -> list[str]:
    titles: list[str] = []
    cont: dict = {}
    while True:
        q = dict(action="query", list="allpages", apprefix=prefix, aplimit=500, format="json", **cont)
        data = json.loads(curl(f"{WIKI}/w/api.php?" + urllib.parse.urlencode(q)))
        titles += [p["title"] for p in data["query"]["allpages"]]
        if "continue" not in data:
            return titles
        cont = data["continue"]
        time.sleep(1)


def fetch_raw(title: str) -> str:
    return curl(f"{WIKI}/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"}))


def fetch_book(book: dict, raw_dir: Path) -> None:
    d = raw_dir / book["slug"]
    d.mkdir(parents=True, exist_ok=True)
    titles = [book["single"]] if book.get("single") else list_prefix(book["prefix"])
    (d / "titles.json").write_text(json.dumps(titles, ensure_ascii=False), encoding="utf8")
    for i, title in enumerate(titles):
        f = d / f"{i:03d}.wiki"
        if not f.exists():
            f.write_text(fetch_raw(title), encoding="utf8")
            time.sleep(0.7)


def strip_templates(text: str) -> str:
    """Drop every {{...}} template, nested ones included."""
    out, depth, i = [], 0, 0
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1
            i += 2
        elif text.startswith("}}", i) and depth:
            depth -= 1
            i += 2
        else:
            if not depth:
                out.append(text[i])
            i += 1
    return "".join(out)


def clean_wikitext(raw: str) -> str:
    text = raw.replace("\r", "")
    text = re.sub(r"(?s)<!--.*?-->", "", text)
    text = re.split(r"^==\s*라이선스\s*==", text, flags=re.M)[0]
    text = re.sub(r"(?s)\{\{옛한글/시작\}\}.*?\{\{옛한글/끝\}\}", "", text)
    modern = re.search(r"^==\s*현대어\s*==\s*$", text, flags=re.M)
    if modern:
        text = re.split(r"^==[^=]", text[modern.end():], flags=re.M)[0]
    bold = re.search(r"\'\'\'\s*현대어\s*\'\'\'", text)
    if bold:
        text = re.split(r"\{\{Multicol-break\}\}|\'\'\'\s*원문\s*\'\'\'", text[bold.end():])[0]
    text = strip_templates(text)
    text = re.split(r"^=+\s*주석\s*=+\s*$", text, flags=re.M)[0]
    text = re.sub(r"^\s*\[\[(분류|Category|파일|File):[^\]]*\]\]\s*$", "", text, flags=re.M | re.I)
    text = re.sub(r"(?s)<ref[^>]*>.*?</ref>", "", text)
    text = re.sub(r"<pages [^>]*/>", "", text)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</?(center|poem|div|span|small|big|font|u|s|sup|sub)[^>]*>", "", text, flags=re.I)
    text = re.sub(r"</?[A-Za-z][^>\n]*>", "", text)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"'''?", "", text)
    text = text.replace("&nbsp;", " ").replace("🙝🙟", "")
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[\u4e00-\u9fff]+[(\[]([가-힣]+)[)\]]", r"\1", text)
    text = re.sub(r"\s?[(\[][\u4e00-\u9fff]+[)\]]", "", text)
    lines = [ln.rstrip() for ln in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


OLD_HANGUL = re.compile("[\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]")


def words(text: str) -> int:
    return len(re.findall(r"\S+", text))


def split_paragraphs(text: str, verse: bool) -> list[str]:
    pars = []
    for chunk in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
        if not lines:
            continue
        mark = re.fullmatch(r"=+\s*(.+?)\s*=+", lines[0]) if len(lines) == 1 else None
        if mark:
            pars.append(f"### {mark[1]}")
            continue
        pars.append("  \n".join(lines) if verse and len(lines) > 1 else re.sub(r"\s+", " ", " ".join(lines)))
    return pars


def page_title(title: str, prefix: str | None) -> str:
    t = title[len(prefix):] if prefix and title.startswith(prefix) else title
    return re.sub(r"\s*\([^)]*\)$", "", t).strip()


def collect(book: dict, raw_dir: Path) -> list[tuple[str, list[str]]]:
    """Return [(heading, paragraphs)] for every page of the book."""
    d = raw_dir / book["slug"]
    titles = json.loads((d / "titles.json").read_text(encoding="utf8"))
    items = []
    for i, title in enumerate(titles):
        short = page_title(title, book.get("prefix"))
        if any(short == e for e in book.get("exclude", ())):
            continue
        body = clean_wikitext((d / f"{i:03d}.wiki").read_text(encoding="utf8"))
        if words(body) < 4 or OLD_HANGUL.search(body):
            continue
        items.append((short, body))
    if book.get("numeric"):
        items.sort(key=lambda it: int(it[0]) if it[0].isdigit() else 10**6)
    elif book.get("order"):
        rank = {name: n for n, name in enumerate(book["order"])}
        items.sort(key=lambda it: rank.get(it[0], 10**6))
    out = []
    for short, body in items:
        verse = book.get("verse", False)
        pars = split_paragraphs(body, verse)
        if book.get("numeric") and pars and re.match(r"^\d+\. ", pars[0]):
            heading, pars = pars[0], pars[1:]
        elif book.get("single"):
            heading = None
        else:
            heading = short
        if heading and pars and pars[0].replace("  \n", " ").strip() == heading:
            pars = pars[1:]
        out.append((heading, pars))
    return out


def chunk_label(book: dict, chunk: list[str], label: str) -> str:
    """Lesson title after the number: chapter range for serials, story name otherwise."""
    if book.get("numeric"):
        nums = [int(m[1]) for p in chunk if (m := re.match(r"^## (\d+)\. ", p))]
        if nums:
            return f"제{nums[0]}장" if nums[0] == nums[-1] else f"제{nums[0]}~{nums[-1]}장"
    if book.get("verse") and sum(p.startswith("## ") for p in chunk) > 1:
        return f"{label} 외"
    return label


def build(book: dict, raw_dir: Path, out_dir: Path) -> None:
    sections = collect(book, raw_dir)
    lesson_words = book.get("lesson_words", LESSON_WORDS)
    lessons: list[list[str]] = [[]]
    labels: list[str] = [""]
    count = total = 0
    story, part = book["short"], 1
    cap = lesson_words * 1.15
    for heading, pars in sections:
        block = ([f"## {heading}"] if heading else []) + pars
        w = sum(words(p) for p in block)
        long = w > cap
        if count and count + w > cap and (not long or count >= lesson_words * 0.4):
            lessons.append([])
            labels.append("")
            count = 0
        story, part = heading or book["short"], 1
        for par in block:
            if long and count >= lesson_words and not par.startswith("## "):
                lessons.append([])
                labels.append("")
                count = 0
                part += 1
            if not labels[-1]:
                labels[-1] = story if part == 1 else f"{story} ({part})"
            lessons[-1].append(par)
            count += words(par)
        total += w
    if len(lessons) > 1 and words("\n".join(lessons[-1])) < lesson_words // 4:
        lessons[-2].extend(lessons.pop())
        labels.pop()
    book_dir = out_dir / book["slug"]
    if book_dir.exists():
        shutil.rmtree(book_dir)
    book_dir.mkdir(parents=True)
    entries = []
    for n, chunk in enumerate(lessons, start=1):
        label = chunk_label(book, chunk, labels[n - 1])
        title = f"{n}. {label}" if label else f"{n}. {book['short']}"
        name = f"{n:02d}.md"
        (book_dir / name).write_text(f"# {title}\n\n" + "\n\n".join(chunk) + "\n", encoding="utf8")
        entries.append({"file": name, "title": title})
    manifest = {
        "title": book["title"],
        "author": book["author"],
        "level": book["level"],
        "wordCount": total,
        "source": {
            "name": "Korean Wikisource",
            "url": f"{WIKI}/wiki/" + urllib.parse.quote(book["page"].replace(" ", "_"), safe="_()"),
            "license": LICENSE,
        },
        "lessons": entries,
    }
    (book_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{book['slug']}: {len(entries)} lessons, {total} words")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--fetch", action="store_true", help="download the pages first")
    ap.add_argument("--only", help="comma-separated slugs to build")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    for book in BOOKS:
        if only is not None and book["slug"] not in only:
            continue
        if args.fetch:
            fetch_book(book, args.raw)
        build(book, args.raw, args.out)


if __name__ == "__main__":
    main()
