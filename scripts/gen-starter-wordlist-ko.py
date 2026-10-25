#!/usr/bin/env python3
"""Generate the Korean starter wordlist from scripts/starter/ko-seed-words.txt.

wordfreq lists Korean as morphemes (하, 들, 어), so the frequency route of
gen-starter-wordlist.py yields stems and grammar, not words a learner can read.
The seed file is a hand-ordered beginner vocabulary instead: most basic first, in
dictionary form. This script keeps each word the on-device dictionary resolves
(exact headword, else inflection to lemma), drops duplicates, grammar-only and
proper-name entries, and writes the first N as languages/ko/content/starter/wordlist.json.

Usage: python3 scripts/gen-starter-wordlist-ko.py [--top 1000] [--report]
Needs data/dictionary-ko.db (fetch per dict.env). The output is a committed artifact.
"""
import argparse
import json
import math
import sqlite3
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GRAMMAR_ONLY = {"particle", "suffix", "prefix", "root", "character", "symbol", "affix", "interfix", "postp",
                "punct", "romanization", "contraction"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=1000)
    ap.add_argument("--band-size", type=int, default=250)
    ap.add_argument("--report", action="store_true", help="print the words that were dropped")
    args = ap.parse_args()

    db = sqlite3.connect(f"file:{REPO / 'data' / 'dictionary-ko.db'}?mode=ro", uri=True)
    seeds = []
    for line in (REPO / "scripts" / "starter" / "ko-seed-words.txt").read_text(encoding="utf8").splitlines():
        if not line.startswith("#"):
            seeds += unicodedata.normalize("NFC", line).split()

    def pos_of(word: str) -> set[str]:
        return {r[0] for r in db.execute("SELECT DISTINCT pos FROM senses WHERE word = ?", (word,)) if r[0]}

    words, seen, dropped = [], set(), []
    for seed in seeds:
        lemma = seed if db.execute("SELECT 1 FROM entries WHERE word = ?", (seed,)).fetchone() else None
        if lemma is None:
            row = db.execute(
                "SELECT i.lemma FROM inflections i JOIN entries e ON e.word = i.lemma WHERE i.inflected_form = ? LIMIT 1",
                (seed,),
            ).fetchone()
            lemma = row[0] if row else None
        if lemma is None or (pos_of(lemma) and pos_of(lemma) <= GRAMMAR_ONLY) or lemma in seen:
            if lemma is None or lemma not in seen:
                dropped.append(seed)
            continue
        seen.add(lemma)
        rank = len(words) + 1
        words.append({"rank": rank, "lemma": lemma, "zipf": 0, "band": math.ceil(rank / args.band_size)})
        if len(words) >= args.top:
            break

    out = REPO / "languages" / "ko" / "content" / "starter" / "wordlist.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {"language": "ko", "source": "seed", "bandSize": args.band_size, "count": len(words), "words": words}
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"wrote {out} ({len(words)} lemmas, {len(seeds)} seeds)")
    if args.report or len(words) < args.top:
        print("dropped:", " ".join(dropped))


if __name__ == "__main__":
    main()
