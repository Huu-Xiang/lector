#!/usr/bin/env python3
"""Build data/dictionary-en.db for English as the learning language.

Sources (neither is committed):
  - ECDICT 1.0.28 (MIT): https://github.com/skywind3000/ECDICT, file stardict.db
    from ecdict-sqlite-28.zip. Gives IPA, English definitions, Chinese meanings,
    exam tags, Collins stars, Oxford 3000 flag, frequency ranks and word forms.
  - Tatoeba (CC BY 2.0 FR): eng_sentences, cmn_sentences and eng-cmn_links from
    https://downloads.tatoeba.org/exports/per_language/. Gives example sentences
    with Chinese translations.

Usage:
  python3 -I scripts/build-dictionary-en.py --ecdict <stardict.db> \\
      --tatoeba <dir with the three .tsv.bz2 files> --out data/dictionary-en.db

The output keeps the tables every Readfox dictionary has (entries, senses,
related_forms, inflections) and adds entry_meta, senses_i18n and examples.
"""
import argparse
import bz2
import heapq
import os
import re
import sqlite3
import sys
import unicodedata

MAX_RANK = 60_000
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z-]*$")
TOKEN_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

POS_MAP = {
    "n": "noun", "pl": "noun", "v": "verb", "vt": "verb", "vi": "verb", "a": "adj", "adj": "adj",
    "s": "adj", "ad": "adv", "adv": "adv", "r": "adv", "prep": "prep", "conj": "conj",
    "pron": "pron", "num": "num", "art": "det", "int": "intj", "interj": "intj", "aux": "aux",
    "abbr": "abbr", "prefix": "prefix", "suf": "suffix",
}
FORM_LABEL = {
    "p": "past tense", "d": "past participle", "i": "present participle",
    "3": "third person singular", "r": "comparative", "t": "superlative", "s": "plural",
}
PURE_FORM = re.compile(r"的(过去式|过去分词|现在分词|复数|第三人称单数|比较级|最高级)")
# Characters that exist only in Traditional Chinese. Tatoeba mixes both scripts.
TRADITIONAL_ONLY = set(
    "們這個來說時為與會學開關東車長馬風書請問點還從過讓麼對電話嗎樣見兒國後現實產將當總應該種動體機經"
    "師親歲邊夢聽識靜錢寫處買賣貓鳥魚雞龍網傳覺習義樂區業連則導隨雖難願題顏飛飯餐館鐘鐵錯隊隻雙雲頭"
    "達發報報壞寶幫帶幾張強歡決歷歸壓優場孫彈從傷價億內兩劇勞務動勝區醫華單賣南協參啟喬團園圖壇夠奧"
    "婦孩嬰嚴塊裡裏樓條構標檢楊檔歐歲歷殘氣濟溫滿漢潔瀏燈營爾爭獎環現甚畢盡礎禮禱稱穩穿窮節簡紀約級"
    "細終組結絕統經綠維網罰羅義習聖聲職聯肅脫臉臺與興舉艱藝藥蘇處號蟲裝襪覽觀訂計記訪設許訴診評詞詢"
    "試話該詳誤說誰課談請調論謝證識譯警護讀變貓貝財貨貧購貴費資賓賽趕趙躍輕輛輩轉辦農遊運遠適選遲邁"
    "邏鄰醜釋針鈴銀銷鋼錄鎮長閃閉開間閒隊階際雜電靈響頁頂項順預領頻顯風飲餘驅驗體髮鬆鬧鬱魯鮮鹽麗黃"
)
BLOCKLIST = re.compile(
    r"\b(fuck\w*|shit\w*|bitch\w*|rape\w*|sex\w*|porn\w*|nigg\w*|slut\w*|whore\w*|dick|cock|pussy|"
    r"asshole|bastard|suicid\w*|kill(ed|ing)? (myself|himself|herself)|hitler|nazi\w*|terroris\w*|"
    r"cunt|faggot|retard\w*|penis|vagina|naked|nude|masturbat\w*|damn|hell)\b",
    re.I,
)


def ipa(phonetic):
    if not phonetic or not phonetic.strip():
        return None
    s = phonetic.strip()
    s = s.replace("'", "ˈ").replace(",", "ˌ").replace("ә", "ə").replace("^", "ɡ").replace(":", "ː")
    return f"/{s}/"


def parse_lines(text, english):
    """Turn ECDICT multi-line text into (pos, gloss) pairs."""
    senses = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("["):
            continue
        pos = ""
        body = line
        if english:
            m = re.match(r"^(n|v|a|s|r)\s+(.*)$", line)
            if m:
                pos, body = POS_MAP[m.group(1)], m.group(2)
            else:
                m = re.match(r"^([a-z]{1,6})\.\s*(.*)$", line)
                if m and m.group(1) in POS_MAP:
                    pos, body = POS_MAP[m.group(1)], m.group(2)
        else:
            m = re.match(r"^([a-z]{1,6})\.\s*(.*)$", line)
            if m and m.group(1) in POS_MAP:
                pos, body = POS_MAP[m.group(1)], m.group(2)
            if body.startswith("["):
                continue
            body = re.sub(r"\s*,\s*", "，", body)
        body = body.strip(" ;；")
        if body:
            senses.append((pos, body[:300]))
    return senses


def read_ecdict(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """SELECT word, phonetic, definition, translation, collins, oxford, tag, bnc, frq, exchange
           FROM stardict
           WHERE word NOT GLOB '*[^A-Za-z-]*'
             AND ((frq > 0 AND frq <= ?) OR (bnc > 0 AND bnc <= ?)
                  OR (tag IS NOT NULL AND tag <> '') OR collins > 0 OR oxford = 1)""",
        (MAX_RANK, MAX_RANK),
    ).fetchall()
    con.close()
    return rows


def pure_form(row):
    exch = row["exchange"] or ""
    if "0:" not in exch:
        return False
    lines = [l for l in (row["translation"] or "").splitlines() if l.strip() and not l.startswith("[")]
    return bool(lines) and all(PURE_FORM.search(l) for l in lines) and not (row["definition"] or "").strip()


def parse_exchange(exchange):
    out = {}
    for part in (exchange or "").split("/"):
        if ":" in part:
            k, v = part.split(":", 1)
            out.setdefault(k, []).append(v.strip().lower())
    return out


def build_entries(rows):
    by_key = {}
    for row in rows:
        key = row["word"].lower()
        score = (row["word"] == key, bool((row["definition"] or "").strip()), bool((row["translation"] or "").strip()))
        if key not in by_key or score > by_key[key][0]:
            by_key[key] = (score, row)
    chosen = {k: v[1] for k, v in by_key.items()}
    return chosen


def traditional(text):
    return any(ch in TRADITIONAL_ONLY for ch in text)


def good_english(text):
    n = len(TOKEN_RE.findall(text))
    return (
        5 <= n <= 14
        and len(text) <= 110
        and text[:1].isupper()
        and text[-1:] in ".?!"
        and not re.search(r"\d", text)
        and not BLOCKLIST.search(text)
    )


def read_tsv(path):
    with bz2.open(path, "rt", encoding="utf8") as handle:
        for line in handle:
            yield line.rstrip("\n").split("\t")


def collect_examples(tatoeba_dir, headwords, forms):
    cmn = {}
    for parts in read_tsv(os.path.join(tatoeba_dir, "cmn_sentences.tsv.bz2")):
        if len(parts) >= 3 and not traditional(parts[2]) and len(parts[2]) <= 60:
            cmn[parts[0]] = parts[2]
    zh_of = {}
    for parts in read_tsv(os.path.join(tatoeba_dir, "eng-cmn_links.tsv.bz2")):
        if len(parts) >= 2 and parts[1] in cmn:
            zh_of.setdefault(parts[0], cmn[parts[1]])

    best = {}
    texts = {}
    for parts in read_tsv(os.path.join(tatoeba_dir, "eng_sentences.tsv.bz2")):
        if len(parts) < 3:
            continue
        sid, text = parts[0], parts[2]
        if not good_english(text):
            continue
        tokens = [t.lower() for t in TOKEN_RE.findall(text)]
        has_zh = sid in zh_of
        closeness = -abs(len(tokens) - 9)
        seen = set()
        for tok in tokens:
            lemma = tok if tok in headwords else forms.get(tok)
            if not lemma or lemma in seen:
                continue
            seen.add(lemma)
            score = (1 if has_zh else 0, 1 if tok == lemma else 0, closeness, -int(sid))
            heap = best.setdefault(lemma, [])
            if len(heap) < 3:
                heapq.heappush(heap, (score, sid))
            elif score > heap[0][0]:
                heapq.heapreplace(heap, (score, sid))
            texts[sid] = text
    return best, texts, zh_of


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ecdict", required=True)
    ap.add_argument("--tatoeba", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rows = read_ecdict(args.ecdict)
    chosen = build_entries(rows)
    print(f"candidate headwords: {len(chosen)}", file=sys.stderr)

    keep = {}
    form_entries = {}
    for key, row in chosen.items():
        if pure_form(row):
            form_entries[key] = row
        else:
            keep[key] = row

    forms = {}
    form_type = {}
    related = []
    for key, row in list(keep.items()) + list(form_entries.items()):
        ex = parse_exchange(row["exchange"])
        if key in form_entries:
            lemma = (ex.get("0") or [None])[0]
            kind = (ex.get("1") or [""])[0]
            if lemma in keep and kind in FORM_LABEL:
                forms.setdefault(key, lemma)
                form_type[(key, lemma)] = FORM_LABEL[kind]
            continue
        listed = set()
        for code, label in FORM_LABEL.items():
            for form in ex.get(code, []):
                if form != key and WORD_RE.match(form):
                    forms.setdefault(form, key)
                    form_type.setdefault((form, key), label)
                    if form not in listed:
                        listed.add(form)
                        related.append((key, form, label))
        lemma = (ex.get("0") or [None])[0]
        if lemma and lemma in keep and lemma != key:
            related.append((key, lemma, "base form"))

    best, texts, zh_of = collect_examples(args.tatoeba, set(keep), forms)

    if os.path.exists(args.out):
        os.remove(args.out)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    db = sqlite3.connect(args.out)
    db.executescript(
        """
        CREATE TABLE entries (word TEXT PRIMARY KEY, rank INTEGER, ipa TEXT, etymology TEXT);
        CREATE TABLE senses (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, pos TEXT,
                             gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
        CREATE INDEX idx_senses_word ON senses(word);
        CREATE TABLE related_forms (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL,
                                    related_word TEXT NOT NULL, relation TEXT NOT NULL);
        CREATE INDEX idx_related_word ON related_forms(word);
        CREATE TABLE inflections (inflected_form TEXT NOT NULL, lemma TEXT NOT NULL, type TEXT,
                                  PRIMARY KEY (inflected_form, lemma));
        CREATE INDEX idx_inflections_lemma ON inflections(lemma);
        CREATE TABLE entry_meta (word TEXT PRIMARY KEY, collins INTEGER, oxford INTEGER, tags TEXT,
                                 bnc INTEGER, frq INTEGER);
        CREATE TABLE senses_i18n (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, lang TEXT NOT NULL,
                                  pos TEXT, gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
        CREATE INDEX idx_senses_i18n ON senses_i18n(word, lang);
        CREATE TABLE examples (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
                               sentence TEXT NOT NULL, translation TEXT, translation_lang TEXT);
        CREATE INDEX idx_examples_word ON examples(word);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    n_en = n_zh = n_ex = 0
    for key, row in keep.items():
        rank = row["frq"] if (row["frq"] or 0) > 0 else (row["bnc"] if (row["bnc"] or 0) > 0 else None)
        db.execute(
            "INSERT INTO entries (word, rank, ipa, etymology) VALUES (?,?,?,NULL)",
            (key, rank, ipa(row["phonetic"])),
        )
        for i, (pos, gloss) in enumerate(parse_lines(row["definition"], True)[:8]):
            db.execute("INSERT INTO senses (word,pos,gloss,sort_order) VALUES (?,?,?,?)", (key, pos, gloss, i))
            n_en += 1
        for i, (pos, gloss) in enumerate(parse_lines(row["translation"], False)[:10]):
            db.execute(
                "INSERT INTO senses_i18n (word,lang,pos,gloss,sort_order) VALUES (?,?,?,?,?)",
                (key, "zh-CN", pos, gloss, i),
            )
            n_zh += 1
        db.execute(
            "INSERT INTO entry_meta (word,collins,oxford,tags,bnc,frq) VALUES (?,?,?,?,?,?)",
            (key, row["collins"] or 0, row["oxford"] or 0, (row["tag"] or "").strip(),
             row["bnc"] or None, row["frq"] or None),
        )
        heap = sorted(best.get(key, []), reverse=True)
        for i, (_, sid) in enumerate(heap):
            zh = zh_of.get(sid)
            db.execute(
                "INSERT INTO examples (word,sort_order,sentence,translation,translation_lang) VALUES (?,?,?,?,?)",
                (key, i, texts[sid], zh, "zh-CN" if zh else None),
            )
            n_ex += 1
    for word, form, label in related:
        db.execute("INSERT INTO related_forms (word,related_word,relation) VALUES (?,?,?)", (word, form, label))
    for (form, lemma), label in form_type.items():
        if lemma in keep:
            db.execute("INSERT OR IGNORE INTO inflections (inflected_form,lemma,type) VALUES (?,?,?)", (form, lemma, label))
    db.executemany(
        "INSERT INTO meta (key,value) VALUES (?,?)",
        [
            ("source", "ECDICT 1.0.28 (MIT) and Tatoeba (CC BY 2.0 FR)"),
            ("entries", str(len(keep))),
        ],
    )
    db.commit()
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("VACUUM")
    db.close()
    size = os.path.getsize(args.out) / 1e6
    print(
        f"entries={len(keep)} english_senses={n_en} chinese_senses={n_zh} examples={n_ex} "
        f"inflections={len(form_type)} size={size:.1f}MB",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
