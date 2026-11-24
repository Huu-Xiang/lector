#!/usr/bin/env python3
"""Build French or Spanish vocabulary-size test pools and library book coverage tables.

Outputs:
  languages/<lang>/content/vocab-test.json
      Frequency bands of lemmas (1,000 wide up to 10,000, then wider up to 30,000), each
      with a curated pool of words, frequency rank (r), and concise English sense rows (s).
  languages/<lang>/content/library/vocab-needs.json
      For every public library book in <lang>: {"n95": R, "n98": R, "cov": [c1 .. c14]}.

Inputs:
  --lang   fr or es
  --dict   path to SHA-256 verified dictionary-<lang>.db (SQLite: entries, senses, inflections)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sqlite3
import unicodedata
from bisect import bisect_right
from collections import Counter, defaultdict
from pathlib import Path

from wordfreq import word_frequency

ROOT = Path(__file__).resolve().parent.parent
SEED = 20261124
POOL_SIZE = 300
MIN_FREQ = 1e-8
BANDS = [(i * 1000 + 1, (i + 1) * 1000) for i in range(10)] + [
    (10001, 12500),
    (12501, 15000),
    (15001, 20000),
    (20001, 25000),
    (25001, 30000),
    (30001, 40000),
]

POS_MAP = {
    "noun": "n.",
    "n": "n.",
    "n.": "n.",
    "verb": "v.",
    "v": "v.",
    "v.": "v.",
    "adj": "adj.",
    "adj.": "adj.",
    "adjective": "adj.",
    "adv": "adv.",
    "adv.": "adv.",
    "adverb": "adv.",
    "prep": "prep.",
    "prep.": "prep.",
    "preposition": "prep.",
    "pron": "pron.",
    "pron.": "pron.",
    "pronoun": "pron.",
    "conj": "conj.",
    "conj.": "conj.",
    "conjunction": "conj.",
    "num": "num.",
    "num.": "num.",
    "numeral": "num.",
}

ENGLISH_FILLER = {
    "a", "an", "the", "to", "of", "in", "on", "at", "by", "for", "from", "with", "into",
    "onto", "as", "or", "and", "be", "is", "are", "was", "were", "being", "been", "one",
    "ones", "someone", "something", "somebody", "person", "thing", "act", "state", "quality",
    "make", "made", "get", "have", "having", "relating", "pertaining", "used", "using",
    "that", "which", "who", "whose", "not", "no", "very", "more", "most", "out", "up", "down",
    "over", "under", "off", "away", "back",
}

BAD_GLOSS_PATTERNS = re.compile(
    r"(?i)\b("
    r"inflection of|infinitive of|dative of|accusative of|genitive of|nominative of|combined with|"
    r"plural of|feminine of|masculine of|singular of|participle of|"
    r"past tense of|present tense of|future tense of|subjunctive of|imperative of|"
    r"conditional of|indicative of|preterite of|imperfect of|gerund of|"
    r"first-person|second-person|third-person|reflexive of|comparative of|superlative of|"
    r"conjugation of|alternative form of|alternative spelling of|obsolete form of|"
    r"archaic form of|dated form of|diminutive of|augmentative of|variant of|form of|"
    r"surname|given name|female given name|male given name|a city|a town|a village|"
    r"a river|a country|capital city|municipality in|department of|region of|province of|"
    r"commune in|initialism of|acronym of|abbreviation of|clipping of|contraction of|"
    r"letter of the|primary school|chemical symbol|"
    r"vulgar|slur|pejorative|derogatory|offensive|profanity|expletive|genitalia|"
    r"penis|vagina|anus|feces|excrement|intercourse|masturbat|prostitut|rape|"
    r"fuck|shit|bitch|whore|cunt|cock|dick|pussy|bastard|asshole"
    r")\b"
)

MIN_WORD_LEN = 3

ROMAN_NUMERALS = {
    "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv",
    "xvi", "xvii", "xviii", "xix", "xx",
}

VALID_WORD_RE = {
    "fr": re.compile(r"^[a-zàâäæçéèêëîïôœùûüÿ]{2,22}$"),
    "es": re.compile(r"^[a-záéíóúüñ]{2,22}$"),
}

TOKEN_RE = {
    "fr": re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿœŒæÆ]+"),
    "es": re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+"),
}

DICT_PINS = {
    "fr": "1d11d56d379d1145dd7f0cfb5e74331bc73425fe3a8bf6918304aa2e73eabf0a",
    "es": "eb00c37f29c809d28c466505f21b07df1232fb622db6e591c92c0f4d2782286b",
}


def verify_sha256(path: Path, expected: str) -> None:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    actual = h.hexdigest().lower()
    if actual != expected.lower():
        raise ValueError(f"SHA-256 mismatch for {path}: expected {expected}, got {actual}")


def strip_parens(text: str) -> str:
    prev = None
    out = text
    while prev != out:
        prev = out
        out = re.sub(r"\([^()]*\)", " ", out)
    return " ".join(out.split()).strip()


def clean_gloss(raw: str) -> str | None:
    text = unicodedata.normalize("NFC", raw).strip()
    if not text or BAD_GLOSS_PATTERNS.search(text):
        return None
    # Strip parenthetical qualifiers before splitting on ';' so no dangling '(' survives.
    text = strip_parens(text)
    text = re.split(r"\s*;\s*", text)[0].strip()
    text = text.rstrip(".,;:").strip()
    if not text or BAD_GLOSS_PATTERNS.search(text):
        return None
    if "(" in text or ")" in text:
        return None
    words = text.split()
    if len(words) == 0 or len(words) > 8 or len(text) > 54:
        return None
    # Reject glosses with unusual characters or leftover brackets
    if any(ch in text for ch in "[]{}<>\\|/") or re.search(r"\d", text):
        return None
    # Reject capitalized proper-noun definitions unless starting with "I "
    if text[0].isupper() and not text.startswith(("I ", "God")):
        first = words[0]
        if len(words) == 1 or first.lower() not in {"to", "a", "an", "the", "one", "in", "on", "of", "for", "with"}:
            return None
        text = text[0].lower() + text[1:]
    return text


def gloss_tokens(senses: list[dict[str, str]]) -> set[str]:
    out: set[str] = set()
    for row in senses:
        for tok in re.findall(r"[a-z]+", row["en"].lower()):
            if len(tok) > 2 and tok not in ENGLISH_FILLER:
                out.add(tok)
    return out


def option_width(senses: list[dict[str, str]]) -> float:
    return float(sum(len(row["en"]) for row in senses))


def load_dictionary(lang: str, db_path: Path):
    word_re = VALID_WORD_RE[lang]
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cur = conn.cursor()

    inflections: dict[str, set[str]] = defaultdict(set)
    for inflected, lemma in cur.execute("SELECT inflected_form, lemma FROM inflections"):
        inf = inflected.strip().lower()
        lem = lemma.strip().lower()
        if inf and lem and inf != lem:
            inflections[inf].add(lem)

    # Track all standalone dictionary headwords (including function words) so inflected
    # homographs like French "comme"/"fois"/"tu" or Spanish "para"/"nada" never donate
    # their frequency to unrelated rare verbs/nouns.
    standalone_words: set[str] = set()
    for (w_raw,) in cur.execute("SELECT word FROM entries"):
        w_low = (w_raw or "").strip().lower()
        if w_low:
            standalone_words.add(w_low)

    first_pos: dict[str, str] = {}
    raw_senses: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for word, pos, gloss in cur.execute(
        "SELECT word, pos, gloss FROM senses ORDER BY word, sort_order, id"
    ):
        w = word.strip()
        w_low = w.lower()
        if w_low:
            standalone_words.add(w_low)
        pos_low = (pos or "").strip().lower()
        if w_low and w_low not in first_pos and pos_low:
            first_pos[w_low] = pos_low
        if not w or len(w) < MIN_WORD_LEN or w != w_low or not word_re.fullmatch(w):
            continue
        if w in ROMAN_NUMERALS:
            continue
        if first_pos.get(w) in {"art", "art.", "article", "det", "det.", "determiner"}:
            continue
        norm_pos = POS_MAP.get(pos_low)
        if not norm_pos:
            continue
        cleaned = clean_gloss(gloss or "")
        if not cleaned:
            continue
        raw_senses[w].append((norm_pos, cleaned))

    conn.close()

    # Keep up to 2 concise senses with distinct POS per lemma
    entries: dict[str, list[dict[str, str]]] = {}
    for w, pairs in raw_senses.items():
        # Skip if the gloss just repeats the target word itself
        senses: list[dict[str, str]] = []
        seen_pos: set[str] = set()
        seen_en: set[str] = set()
        for pos, en in pairs:
            if pos in seen_pos or en.lower() in seen_en:
                continue
            if w in re.findall(r"[a-zà-ÿ]+", en.lower()):
                continue
            senses.append({"p": pos, "en": en})
            seen_pos.add(pos)
            seen_en.add(en.lower())
            if len(senses) == 2:
                break
        if senses and gloss_tokens(senses):
            entries[w] = senses

    return entries, inflections, standalone_words


def rank_lemmas(
    lang: str,
    entries: dict[str, list[dict[str, str]]],
    inflections: dict[str, set[str]],
    standalone_words: set[str],
):
    # Aggregate wordfreq frequencies of each lemma plus genuinely non-standalone inflections.
    base_freq: dict[str, float] = {}
    for lemma in entries:
        f = word_frequency(lemma, lang)
        if f > 0:
            base_freq[lemma] = f

    lemma_freq: dict[str, float] = dict(base_freq)

    for inf, lemmas in inflections.items():
        # Never transfer a standalone headword's frequency (e.g. "para" -> "parar", "comme" -> "commer").
        if inf in standalone_words:
            continue
        valid = [lem for lem in lemmas if lem in entries and base_freq.get(lem, 0.0) > 0]
        if not valid:
            continue
        f = word_frequency(inf, lang)
        if f <= 0:
            continue
        share = f / len(valid)
        for lem in valid:
            # Also guard against extreme homograph distortion where an inflected form is >15x its base.
            if share > base_freq[lem] * 15:
                continue
            lemma_freq[lem] = lemma_freq.get(lem, 0.0) + share

    ranked = [
        (lemma, freq)
        for lemma, freq in lemma_freq.items()
        if freq >= MIN_FREQ
    ]
    ranked.sort(key=lambda item: (-item[1], item[0]))
    rank_of = {lemma: idx + 1 for idx, (lemma, _) in enumerate(ranked)}
    return ranked, rank_of


def build_bands(lang: str, ranked: list[tuple[str, float]], entries: dict[str, list[dict[str, str]]]):
    rng = random.Random(SEED + (1 if lang == "fr" else 2))
    max_rank = BANDS[-1][1]
    band_candidates: list[list[dict]] = [[] for _ in BANDS]

    for idx, (lemma, _freq) in enumerate(ranked):
        r = idx + 1
        if r > max_rank:
            break
        for b_idx, (lo, hi) in enumerate(BANDS):
            if lo <= r <= hi:
                band_candidates[b_idx].append({"w": lemma, "r": r, "s": entries[lemma]})
                break

    out_bands = []
    for b_idx, (lo, hi) in enumerate(BANDS):
        cands = band_candidates[b_idx]
        # Deduplicate identical primary English glosses within a band to preserve distractor diversity
        seen_gloss: set[str] = set()
        unique_cands = []
        for item in cands:
            key = item["s"][0]["en"].lower()
            if key in seen_gloss:
                continue
            seen_gloss.add(key)
            unique_cands.append(item)

        rng.shuffle(unique_cands)
        selected = sorted(unique_cands[:POOL_SIZE], key=lambda item: item["r"])

        # Verify each item has at least 3 non-overlapping distractors in the band
        verified = []
        for item in selected:
            toks = gloss_tokens(item["s"])
            w0 = option_width(item["s"])
            compatible = 0
            for other in selected:
                if other["w"] == item["w"]:
                    continue
                if toks & gloss_tokens(other["s"]):
                    continue
                ratio = option_width(other["s"]) / max(1.0, w0)
                if 0.5 <= ratio <= 1.6:
                    compatible += 1
                    if compatible >= 3:
                        break
            if compatible >= 3:
                verified.append(item)

        if len(verified) < 40:
            raise RuntimeError(f"{lang} band {lo}-{hi} has too few verified words: {len(verified)}")

        out_bands.append({"from": lo, "to": hi, "words": verified})
    return out_bands


def compute_book_needs(
    lang: str,
    rank_of: dict[str, int],
    inflections: dict[str, set[str]],
) -> dict[str, dict]:
    lib_dir = ROOT / "languages" / lang / "content" / "library"
    tok_re = TOKEN_RE[lang]
    # Build fastest best-rank lookup for any inflected form
    best_form_rank: dict[str, int] = dict(rank_of)
    for inf, lemmas in inflections.items():
        ranks = [rank_of[lem] for lem in lemmas if lem in rank_of]
        if ranks:
            best = min(ranks)
            if inf not in best_form_rank or best < best_form_rank[inf]:
                best_form_rank[inf] = best

    needs: dict[str, dict] = {}
    for book_dir in sorted(p for p in lib_dir.iterdir() if p.is_dir()):
        slug = book_dir.name
        counts: Counter[int] = Counter()
        total = 0
        for md_file in sorted(book_dir.glob("*.md")):
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            for raw in tok_re.findall(text):
                low = raw.lower()
                if len(low) == 1:
                    counts[1] += 1
                    total += 1
                    continue
                r = best_form_rank.get(low)
                if r is None:
                    # Proper nouns (capitalized mid-sentence) count as known per Laufer & Nation
                    if raw[0].isupper():
                        counts[1] += 1
                        total += 1
                        continue
                    counts[999999] += 1
                else:
                    counts[r] += 1
                total += 1

        if total == 0:
            needs[slug] = {"n95": None, "n98": None, "cov": [0.0] * 14}
            continue

        sorted_ranks = sorted(counts.keys())
        cum_ranks = []
        cum_counts = []
        running = 0
        for r in sorted_ranks:
            running += counts[r]
            cum_ranks.append(r)
            cum_counts.append(running)

        def cov_at(limit: int) -> float:
            idx = bisect_right(cum_ranks, limit) - 1
            if idx < 0:
                return 0.0
            return round(cum_counts[idx] / total, 4)

        def rank_for(target_share: float) -> int | None:
            needed = target_share * total
            for r, c in zip(cum_ranks, cum_counts):
                if r > 20000:
                    return None
                if c >= needed:
                    return int(r)
            return None

        needs[slug] = {
            "n95": rank_for(0.95),
            "n98": rank_for(0.98),
            "cov": [cov_at((i + 1) * 1000) for i in range(14)],
        }
    return needs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["fr", "es"])
    parser.add_argument("--dict", required=True, type=Path)
    args = parser.parse_args()

    verify_sha256(args.dict, DICT_PINS[args.lang])
    entries, inflections, standalone_words = load_dictionary(args.lang, args.dict)
    ranked, rank_of = rank_lemmas(args.lang, entries, inflections, standalone_words)
    bands = build_bands(args.lang, ranked, entries)
    needs = compute_book_needs(args.lang, rank_of, inflections)

    out_dir = ROOT / "languages" / args.lang / "content"
    out_test = out_dir / "vocab-test.json"
    out_needs = out_dir / "library" / "vocab-needs.json"

    payload = {
        "version": 1,
        "answerLanguage": "en",
        "source": "Word ranking: wordfreq (CC BY-SA 4.0), meanings: Wiktionary via kaikki.org (CC BY-SA)",
        "bands": bands,
    }
    out_test.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    out_needs.write_text(json.dumps(needs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total_words = sum(len(b["words"]) for b in bands)
    print(f"{args.lang}: {total_words} words across {len(bands)} bands -> {out_test}")
    print(f"{args.lang}: {len(needs)} books -> {out_needs}")
    for sample_band in (0, 4, 10, len(bands) - 1):
        b = bands[sample_band]
        sample = [(w["w"], w["r"], w["s"][0]["p"], w["s"][0]["en"]) for w in b["words"][:4]]
        print(f"  band {b['from']}-{b['to']} ({len(b['words'])}): {sample}")


if __name__ == "__main__":
    main()
