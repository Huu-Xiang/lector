#!/usr/bin/env python3
"""Build or validate the Russian companion to the English vocabulary test."""

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import html
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "languages/en/content"
SOURCE = "Ranks: wordfreq. Russian glosses: WikDict, OPUS-MT and editorial corrections."
POS = dict(zip(
    ("n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "num."),
    ("Noun", "Verb", "Adjective", "Adverb", "Preposition", "Pronoun", "Conjunction", "Numeral"),
))
DB_HASHES = {
    "en-ru": "3f65395883b996131c9b7a7b7b7c14c1b4458c892fae0050decd71dc0a3b4b0a",
    "en-zh": "16cf69dc8037a8d4dc6bde260142bf0181f9ff0a008d457f26452f1d80ca5ecd",
}
MODEL_HASHES = {
    "config.json": "8f6496adfc930cbfecbe8281112197705c488fab47d34b4829b06d7f478909af",
    "model.bin": "f5ae1da30bcb61e877c549be8fb5a434193893eb97509ccd0b954465f9a8f80c",
    "shared_vocabulary.json": "bf1812383ed402163a2ed1b553e175e7db96a54ed68b6c15566018fdf945ed99",
    "source.spm": "16bebef1389a0b8ab452772c4e35b9e605e5713f8ac7baa71ca701394eaa086d",
    "target.spm": "745998e51ba5b058e38b7ac7765c25c43ed5c1c39cc92b27163b9b2e323c9d7c",
}
RUSSIAN = re.compile(r"[а-яё]+(?:[ ,;–-]+[а-яё]+)*")
LINK = re.compile(r"\[\[(?:[^\[\]|]+\|)?([^\[\]|]+)\]\]")
EN_STOP = set("a an the to of in on and or at by as is be are that which who for with from it its one something someone thing person used use way".split())
RU_STOP = set("а в или и к как на не но о от по с у что это за".split())
VERB_FRAGMENT = re.compile(r"^чтобы (?=[а-яё]+(?:ть|ти|чь)(?:ся|сь)?\b)")


def verify_file(path, expected):
    with path.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != expected:
            raise ValueError(f"Unexpected input revision: {path}")


def load_rows(path, words):
    verify_file(path, DB_HASHES[path.stem])
    result = defaultdict(list)
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
        for w, entry, sense, glosses in db.execute(
            "SELECT written_rep, lexentry, sense, trans_list FROM translation "
            "WHERE sense <> '' AND lexentry <> '' ORDER BY score DESC, lexentry, sense, trans_list"
        ):
            if w in words:
                result[w].append((entry, sense, glosses))
    return result


def terms(text):
    return LINK.sub(r"\1", html.unescape(text)).split(" | ")


def clean_ru(text):
    text = unicodedata.normalize("NFC", html.unescape(text)).replace("\u0301", "")
    text = " ".join(text.lower().split()).strip(" .")
    if len(text) <= 64 and RUSSIAN.fullmatch(text):
        return text
    return None


def tokens(text, pattern, stop, stemmer):
    return set(stemmer.stemWords([x for x in re.findall(pattern, text.lower()) if x not in stop]))


def translation_input(sense):
    en = sense["en"].strip().rstrip(".")
    if sense["p"] == "v." and not en.lower().startswith("to "):
        en = "to " + en
    return en[:1].upper() + en[1:] + "."


def translate(senses, model):
    import ctranslate2
    import sentencepiece

    for name, expected in MODEL_HASHES.items():
        verify_file(model / name, expected)
    translator = ctranslate2.Translator(
        str(model), device="cpu", compute_type="int8", intra_threads=4
    )
    source = sentencepiece.SentencePieceProcessor(model_file=str(model / "source.spm"))
    target = sentencepiece.SentencePieceProcessor(model_file=str(model / "target.spm"))
    inputs = sorted({translation_input(sense) for sense in senses})
    translations = {}
    print(f"Translating {len(inputs)} unique sense definitions on CPU", flush=True)
    for start in range(0, len(inputs), 128):
        if start and start % 1024 == 0:
            print(f"Translated {start}/{len(inputs)}", flush=True)
        batch = inputs[start:start + 128]
        encoded = [source.encode(text, out_type=str) + ["</s>"] for text in batch]
        results = translator.translate_batch(encoded, beam_size=4, return_scores=True, max_batch_size=64)
        for text, result in zip(batch, results, strict=True):
            translations[text] = (target.decode(result.hypotheses[0]), result.scores[0])
    return translations


def dictionary_gloss(w, sense, ru_rows, zh_rows, mt, en_stemmer, ru_stemmer):
    source = tokens(sense["en"], r"[a-z]+", EN_STOP, en_stemmer)
    ru_tokens = tokens(mt or "", r"[а-яё]+", RU_STOP, ru_stemmer)
    cn = set(sense["zh"])
    matching_zh = {(entry, label) for entry, label, text in zh_rows[w] if cn.intersection(terms(text))}
    candidates = {}
    for entry, label, text in ru_rows[w]:
        if entry.partition("__")[2].partition("__")[0] != POS[sense["p"]]:
            continue
        label_tokens = tokens(label, r"[a-z]+", EN_STOP, en_stemmer)
        shared = len(source & label_tokens)
        ratio = 2 * shared / (len(source) + len(label_tokens) or 1)
        pivot = (entry, label) in matching_zh
        exact = sense["en"].strip(" .").lower() == label.strip(" .").lower()
        for term in terms(text):
            ru = clean_ru(term)
            if not ru:
                continue
            term_tokens = tokens(ru, r"[а-яё]+", RU_STOP, ru_stemmer)
            confirms = bool(term_tokens) and term_tokens <= ru_tokens
            if not (exact or (pivot and (shared or confirms)) or
                    (shared >= 2 and ratio >= 0.72) or (ratio >= 0.4 and confirms)):
                continue
            strength = (exact, pivot and confirms, pivot, confirms, ratio, shared)
            candidates[ru] = max(candidates.get(ru, strength), strength)
    if not candidates:
        return None
    return max(candidates, key=lambda ru: (candidates[ru], -len(ru), ru))


def validate_overrides(words, overrides):
    for w, by_pos in overrides.items():
        if w not in words:
            raise ValueError(f"Unknown override word: {w}")
        source_senses = {s["p"]: s["en"] for s in words[w]["s"]}
        for pos, override in by_pos.items():
            if source_senses.get(pos) != override["en"]:
                raise ValueError(f"Stale override: {w} {pos}")
            if not valid_glosses(override["ru"]):
                raise ValueError(f"Invalid override: {w} {pos}")


def build(english, words, overrides, data, model, audit_path):
    import snowballstemmer

    ru_rows, zh_rows = (load_rows(data / (pair + ".sqlite3"), words) for pair in DB_HASHES)
    en_stemmer, ru_stemmer = (snowballstemmer.stemmer(lang) for lang in ("english", "russian"))
    mt = translate((s for w in words.values() for s in w["s"]), model)
    counts = Counter()
    audit_rows = []
    bands = []
    for band in english["bands"]:
        localized = []
        for w in band["words"]:
            senses = []
            for sense in w["s"]:
                override = overrides.get(w["w"], {}).get(sense["p"])
                raw, score = mt[translation_input(sense)]
                draft = clean_ru(raw)
                if override is not None:
                    glosses, method = override["ru"], "editorial"
                else:
                    match = dictionary_gloss(
                        w["w"], sense, ru_rows, zh_rows, draft, en_stemmer, ru_stemmer
                    )
                    if match:
                        glosses, method = [match], "WikDict"
                    elif draft:
                        if sense["p"] == "v.":
                            draft = VERB_FRAGMENT.sub("", draft)
                        glosses, method = [draft], "OPUS-MT"
                    else:
                        glosses, method = [], "unresolved"
                senses.append({"p": sense["p"], "en": sense["en"], "ru": glosses})
                counts[method] += 1
                if audit_path:
                    audit_rows.append((
                        band["from"], w["w"], w["r"], sense["p"], sense["en"],
                        method, " | ".join(glosses), score, raw,
                    ))
            localized.append({"w": w["w"], "r": w["r"], "s": senses})
        bands.append({"from": band["from"], "to": band["to"], "words": localized})
    if audit_path:
        with audit_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t")
            writer.writerow(("band", "word", "rank", "pos", "en", "source", "ru", "mt_score", "mt_raw"))
            writer.writerows(audit_rows)
    print("Included senses by source:", dict(counts))
    if counts["unresolved"]:
        raise ValueError(f"{counts['unresolved']} senses need editorial Russian glosses")
    return {"version": english["version"], "source": SOURCE, "bands": bands}


def valid_glosses(glosses):
    return (
        isinstance(glosses, list) and 1 <= len(glosses) <= 3
        and all(isinstance(g, str) and clean_ru(g) == g for g in glosses)
        and len({g.replace("ё", "е") for g in glosses}) == len(glosses)
    )


def validate(english, russian, overrides):
    if russian["source"] != SOURCE:
        raise ValueError("Missing or outdated Russian source credit")
    if russian["version"] != english["version"] or not (
        len(russian["bands"]) == len(english["bands"]) == 16
    ):
        raise ValueError("Bank version or band count changed")
    for en_band, ru_band in zip(english["bands"], russian["bands"], strict=True):
        if any(en_band[k] != ru_band[k] for k in ("from", "to")):
            raise ValueError("Rank band changed")
        if not len(en_band["words"]) == len(ru_band["words"]) == 375:
            raise ValueError(f"Expected 375 words in band starting at {en_band['from']}")
        for original, w in zip(en_band["words"], ru_band["words"], strict=True):
            if (w["w"], w["r"]) != (original["w"], original["r"]):
                raise ValueError(f"Word ID, rank or order changed for {original['w']}")
            if [(s["p"], s["en"]) for s in w["s"]] != [(s["p"], s["en"]) for s in original["s"]]:
                raise ValueError(f"Incomplete or changed senses for {w['w']}")
            if any(not valid_glosses(s["ru"]) or set(s) != {"p", "en", "ru"} for s in w["s"]):
                raise ValueError(f"Invalid Russian row for {w['w']}")
            for sense in w["s"]:
                override = overrides.get(w["w"], {}).get(sense["p"])
                if override is not None and sense["ru"] != override["ru"]:
                    raise ValueError(f"Unapplied override: {w['w']} {sense['p']}")
    coverage = [len(b["words"]) for b in russian["bands"]]
    senses = sum(len(w["s"]) for band in russian["bands"] for w in band["words"])
    print(f"{sum(coverage)}/6000 complete words and {senses} senses; by band: {coverage}")


def compact_json(bank):
    def compact(value):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    bands = []
    for band in bank["bands"]:
        entries = ",\n".join("  " + compact(w) for w in band["words"])
        bands.append(f' {{"from":{band["from"]},"to":{band["to"]},"words":[\n{entries}\n ]}}')
    return (
        f'{{"version":{bank["version"]},"source":{compact(bank["source"])},"bands":[\n'
        + ",\n".join(bands) + "\n]}\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, help="Directory holding the pinned WikDict SQLite files")
    parser.add_argument("--model", type=Path, help="Directory holding the pinned OPUS-MT model")
    parser.add_argument("--check", action="store_true", help="Validate the committed bank without dependencies")
    parser.add_argument("--audit", type=Path, help="Write per-sense source and translation scores to a TSV during a build")
    parser.add_argument("--output", type=Path, default=CONTENT / "vocab-test-ru.json")
    args = parser.parse_args()
    english = json.loads((CONTENT / "vocab-test.json").read_text(encoding="utf-8"))
    words = {word["w"]: word for band in english["bands"] for word in band["words"]}
    if len(words) != 6000:
        raise ValueError("Expected 6000 distinct English word IDs")
    overrides = json.loads((CONTENT / "vocab-test-ru-overrides.json").read_text(encoding="utf-8"))
    validate_overrides(words, overrides)
    if args.check:
        validate(english, json.loads(args.output.read_text(encoding="utf-8")), overrides)
        return
    if not (args.data and args.model):
        parser.error("building requires --data and --model")
    russian = build(english, words, overrides, args.data.resolve(), args.model.resolve(), args.audit)
    validate(english, russian, overrides)
    args.output.write_text(compact_json(russian), encoding="utf-8")


if __name__ == "__main__":
    main()
