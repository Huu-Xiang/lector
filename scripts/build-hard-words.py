#!/usr/bin/env python3
"""Write the hard words of each free library book for the public book pages.

For every book in languages/<lang>/content/library, the script counts the
lower-case words of the whole text, drops names (words written in lower case
less than half the time), keeps the words that are rare in everyday use, and
stores the 50 that the book uses most often in
languages/<lang>/content/library/hard-words.json.

Needs the wordfreq package in a throwaway venv:
  python3 -m venv tmp/starter-venv && tmp/starter-venv/bin/pip install wordfreq
  tmp/starter-venv/bin/python scripts/build-hard-words.py [--lang en]

Chinese and Korean are skipped: their text needs a segmenter first.
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from wordfreq import zipf_frequency

LANGS = ["en", "fr", "es"]
LIMIT = 50
# Zipf 3.5 is about one use per 300,000 words; below 1.5 is mostly typos or names.
MAX_ZIPF = 3.5
MIN_ZIPF = 1.5
MIN_LENGTH = 4
MIN_COUNT = 2

WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)?", re.UNICODE)
MARKUP = re.compile(r"^#+\s.*$|[*_]{1,2}", re.MULTILINE)


def hard_words(text: str, lang: str) -> list[str]:
    counts: Counter[str] = Counter()
    lower_case: Counter[str] = Counter()
    for match in WORD.finditer(MARKUP.sub(" ", text)):
        token = match.group(0).replace("’", "'")
        if "'" in token:
            continue
        word = token.lower()
        counts[word] += 1
        if token == word:
            lower_case[word] += 1
    scored = []
    for word, count in counts.items():
        if lower_case[word] * 2 < count or len(word) < MIN_LENGTH or count < MIN_COUNT:
            continue
        zipf = zipf_frequency(word, lang)
        if MIN_ZIPF <= zipf < MAX_ZIPF:
            scored.append((-count, zipf, word))
    scored.sort()
    return [word for _, _, word in scored[:LIMIT]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=LANGS, action="append")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent / "languages"
    for lang in args.lang or LANGS:
        library = root / lang / "content" / "library"
        result: dict[str, list[str]] = {}
        for book in sorted(p for p in library.iterdir() if (p / "manifest.json").is_file()):
            manifest = json.loads((book / "manifest.json").read_text("utf-8"))
            text = "\n\n".join(
                (book / lesson["file"]).read_text("utf-8") for lesson in manifest["lessons"]
            )
            result[book.name] = hard_words(text, lang)
        out = library / "hard-words.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", "utf-8")
        print(f"{lang}: {len(result)} books -> {out.relative_to(root.parent)}")


if __name__ == "__main__":
    main()
