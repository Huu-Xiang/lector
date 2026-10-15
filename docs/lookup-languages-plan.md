# Word lookup in any language pair

Status: steps 1 to 3 are built for English. Steps 4 and 5 are planned.

## How a lookup works today

1. The reader asks `/api/dictionary/lookup`. This reads an on-device dictionary for the learning language. No AI is used.
2. On a miss, `/api/translate/gloss` streams a short AI meaning in the learner's own language (`nativeLanguage`).
3. The learner can press "AI re-translate" or "Enrich". This asks the AI for senses, IPA, etymology and related forms.

The on-device dictionaries come from the English Wiktionary (kaikki.org). Their meanings are in English. So a French word shows English meanings, whatever the learner's own language is.

## Goal

Any learning language to any own language. First scope: English, French and Chinese, in every direction.

| Learning language | Own language | Dictionary needed | Status |
| --- | --- | --- | --- |
| French | English | `dict-fr` | Works. |
| French | Chinese | `dict-fr` + localize | Step 1 done. |
| Chinese | English | `dict-zh` | Works. |
| Chinese | French | `dict-zh` + localize | Step 1 done. |
| English | Chinese | `dict-en` | Works (Chinese meanings built in). |
| English | French | `dict-en` + localize | Works. |
| English | English | `dict-en` | Works. |

## Step 1 (done): translate dictionary meanings into the learner's language

- `POST /api/translate/localize` reads the on-device entry on the server. It asks a cheap model to translate each English meaning. It returns the same senses in the learner's language.
- The result goes into table `shared_entry_cache` (language, own language, word). Later lookups by any user cost nothing and use no quota.
- A cache miss uses one "word lookup" from the monthly allowance. A learner with their own key spends their own tokens and writes nothing to the shared cache.
- The reader shows the English meanings at once and swaps in the translation when it arrives.
- Cost: about 150 tokens per new word. This is a small fraction of a cent.

## Step 2 (done): English dictionary

- `scripts/build-dictionary-en.py` builds `dictionary-en.db` from ECDICT 1.0.28 (MIT) and Tatoeba (CC BY 2.0 FR). It keeps about 58,000 common single words, chosen by frequency rank, exam tag, Collins stars or the Oxford 3000 list.
- The file is a release asset of this fork (`dict-en-2026-10-15`). `dict.env` pins it with `DICT_BASE_EN`, a per-language release base. The server downloads it when an account has English enabled.
- English meanings come from ECDICT's definitions. Chinese meanings come from its translations and are stored in `senses_i18n`. A learner whose own language is Chinese gets the Chinese meanings. Other learners get the English definitions, and `/api/translate/localize` translates them.
- Word forms (`went`, `children`) resolve to the base word through the `inflections` table.

## Step 3 (done): richer entries

- New tables `entry_meta` (Collins stars, Oxford flag, exam tags, frequency), `senses_i18n` and `examples`. Other dictionaries do not have them, and the lookup skips them.
- The lookup returns `examples`, `tags`, `collins`, `oxford`, `senseLanguage` and `englishSenses`.
- The drawer shows badges, senses grouped by part of speech with numbers, English definitions beside Chinese ones, and example sentences with the looked-up word in bold.
- To rebuild: run the script with the ECDICT `stardict.db` and the three Tatoeba files, publish the new file as a release, and update the pin in `dict.env`.

## Step 4: polish

- Show a small "translating..." line while step 1 runs.
- Translate the etymology text too.
- Use the same localization on the Practice page.
- Same language for both (for example English learner, English reader): ask the AI for a simple English definition, not a translation.
- Chinese as the learning language: show pinyin with each meaning.

## Step 5: scale

- Warm the shared cache for the 5,000 most common words of each language pair, with a batch job. Then most first lookups cost nothing.
- Add a global limit and a fallback model if the model provider returns errors.

## Open questions

- Should a cache miss in step 1 cost the learner one word lookup? Today it does.
