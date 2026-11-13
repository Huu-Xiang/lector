# Russian answers for the English vocabulary test

[`vocab-test-ru.json`](../languages/en/content/vocab-test-ru.json) provides Russian answers for all **6,000 words and 6,259 senses** in the version 3 English test. It preserves all 16 bands and the order, IDs (`w`), ranks (`r`), parts of speech (`p`), and English definitions (`en`). Each sense has one to three Russian glosses in `ru` in place of `zh`. The English bank and the book coverage data remain the source for frequency and scoring.

## Sources and selection

- The input is the checked-in [English vocabulary bank](../languages/en/content/vocab-test.json). Its rank data comes from [wordfreq](https://github.com/rspeer/wordfreq) (data: CC BY-SA 4.0); the original bank credits [ECDICT](https://github.com/skywind3000/ECDICT) (MIT) for dictionary data.
- [WikDict](https://www.wikdict.com/page/download) by Karl Bartel, using definitions and translations from [Wiktionary contributors](https://www.wiktionary.org/) via [DBnary](https://kaiko.getalp.org/about-dbnary/), supplies Russian equivalents. The builder uses the English–Russian and English–Chinese SQLite exports from the [June 2026 WikDict snapshot](https://download.wikdict.com/dictionaries/sqlite/2_2026-06/). It matches the English headword and part of speech, then checks the English definition or a shared Chinese translation on the same dictionary sense. It cleans and selects an equivalent from the matched entry. For page-level attribution, see the headword's entry and history on [English Wiktionary](https://en.wiktionary.org/). The adapted Russian bank is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- When a dictionary equivalent cannot be matched, the builder translates the existing English sense definition offline with [Helsinki-NLP OPUS-MT English–Russian](https://huggingface.co/Helsinki-NLP/opus-mt-en-ru) (Apache 2.0) and the [pinned CTranslate2 INT8 artifact](https://huggingface.co/ordois/opus-mt-en-ru-ctranslate2-int8/tree/9ae164a637a7e380d3e09768899c886af9925afe). It adds an English infinitive marker where needed and cleans up a leading Russian «чтобы» before common infinitive forms.
- [Editorial corrections](../languages/en/content/vocab-test-ru-overrides.json) take precedence. Each correction is bound to the source headword, part of speech, and English definition. The builder requires a usable Russian gloss for every override and fails the build if any sense remains unresolved.

## Coverage and review

The previous bank covered 3,198 words (53.3%) and 3,275 senses. The current bank restores 2,802 words and 2,984 senses. The source counts below are per sense.

| Rank band     | Previous words | Current words |    Senses | Editorial |   WikDict |   OPUS-MT |
| ------------- | -------------: | ------------: | --------: | --------: | --------: | --------: |
| 1–1,000       |            260 |           375 |       421 |       319 |        63 |        39 |
| 1,001–2,000   |            235 |           375 |       408 |        60 |       113 |       235 |
| 2,001–3,000   |            208 |           375 |       408 |        57 |        95 |       256 |
| 3,001–4,000   |            202 |           375 |       392 |        54 |        88 |       250 |
| 4,001–5,000   |            221 |           375 |       390 |        45 |        91 |       254 |
| 5,001–6,000   |            216 |           375 |       401 |        54 |        79 |       268 |
| 6,001–7,000   |            217 |           375 |       386 |        49 |        68 |       269 |
| 7,001–8,000   |            179 |           375 |       391 |        45 |        64 |       282 |
| 8,001–9,000   |            195 |           375 |       386 |        47 |        58 |       281 |
| 9,001–10,000  |            187 |           375 |       382 |        53 |        47 |       282 |
| 10,001–12,500 |            201 |           375 |       386 |        41 |        55 |       290 |
| 12,501–15,000 |            189 |           375 |       380 |        49 |        52 |       279 |
| 15,001–20,000 |            191 |           375 |       385 |        47 |        45 |       293 |
| 20,001–25,000 |            181 |           375 |       385 |        54 |        44 |       287 |
| 25,001–30,000 |            149 |           375 |       379 |        50 |        31 |       298 |
| 30,001–40,000 |            167 |           375 |       379 |        49 |        24 |       306 |
| **Total**     |      **3,198** |     **6,000** | **6,259** | **1,073** | **1,017** | **4,169** |

- The audit compared the Russian text with the English definition and part of speech. It covered all 45 senses that lacked a structurally valid automatic gloss, the 100 lowest-scoring model glosses from the first full draft, and the 100 highest-ranked senses from previously missing words.
- The first cross-band sample used three previously present and three restored senses per band, drawn with seed `20261112`. A follow-up checked four additional senses per band. It used the two lowest-scoring unreviewed model glosses plus one random model gloss and one random dictionary gloss, with seed `20261113`. The cohorts overlap with other checks.
- Additional checks targeted sentence fragments, first- and second-person phrasing, repetition, and mistranslated terms. The 11 words flagged in spot checks now have editorial glosses for all 15 senses. Examples include `deputy` → «заместитель», `equilibrium` → «равновесие», and `puncture` → «прокол» (noun) or «прокалывать» (verb).
- Exact parity and gloss-format checks cover every row. Semantic review was sampled. Of the 4,169 model glosses, 2,306 still score below the old cutoff of `-0.47`. That score ranks model outputs for review and does not measure translation accuracy. The remaining automatic glosses can contain awkward wording or sense errors.

## Rebuild

From the repository root, download only the public inputs into a scratch directory:

```sh
scratch=$(mktemp -d)
wikdict=https://download.wikdict.com/dictionaries/sqlite/2_2026-06
curl -fsSL "$wikdict/en-ru.sqlite3" -o "$scratch/en-ru.sqlite3"
curl -fsSL "$wikdict/en-zh.sqlite3" -o "$scratch/en-zh.sqlite3"

model=https://huggingface.co/ordois/opus-mt-en-ru-ctranslate2-int8/resolve/9ae164a637a7e380d3e09768899c886af9925afe
curl -fsSL "$model/opus-mt-en-ru-ctranslate2-int8.zip" -o "$scratch/model.zip"
printf '%s  %s\n' f4c3ab9becb25549673ae407c5db73f86bcf57719426e497c592415a5b512bcd "$scratch/model.zip" | shasum -a 256 -c
unzip -q "$scratch/model.zip" -d "$scratch"
```

Use Python 3.12 with the pinned libraries. The builder checks the SQLite and model file hashes before use.

```sh
python3.12 -m venv "$scratch/venv"
"$scratch/venv/bin/pip" install ctranslate2==4.6.0 sentencepiece==0.2.1 snowballstemmer==3.0.1
"$scratch/venv/bin/python" scripts/build-vocab-test-ru.py \
  --data "$scratch" --model "$scratch/opus-mt-en-ru-ctranslate2-int8" \
  --audit "$scratch/audit.tsv" --output "$scratch/rebuilt.json"
python3 scripts/build-vocab-test-ru.py --check
cmp "$scratch/rebuilt.json" languages/en/content/vocab-test-ru.json
```

The optional audit TSV records the band, word, rank, part of speech, English definition, selected source and Russian glosses, model score, and raw model output for every sense. Use it to find unresolved rows or to select review samples. The reference build used an Apple Silicon CPU. Other CTranslate2 platforms may resolve close decoding scores differently. The app reads the generated JSON directly.
