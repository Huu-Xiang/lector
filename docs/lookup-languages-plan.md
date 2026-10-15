# Word lookup in any language pair

Status: step 1 is built. Steps 2 to 5 are planned.

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
| English | Chinese or French | `dict-en` + localize | Needs step 2. Until then the AI gloss is used. |
| English | English | `dict-en` | Needs step 2. |

## Step 1 (done): translate dictionary meanings into the learner's language

- `POST /api/translate/localize` reads the on-device entry on the server. It asks a cheap model to translate each English meaning. It returns the same senses in the learner's language.
- The result goes into table `shared_entry_cache` (language, own language, word). Later lookups by any user cost nothing and use no quota.
- A cache miss uses one "word lookup" from the monthly allowance. A learner with their own key spends their own tokens and writes nothing to the shared cache.
- The reader shows the English meanings at once and swaps in the translation when it arrives.
- Cost: about 150 tokens per new word. This is a small fraction of a cent.

## Step 2: English dictionary

- Add an `en` profile to `scripts/build-dictionary.ts`. Source: the English entries of the English Wiktionary. The meanings are English definitions, like a learner's dictionary.
- Publish `dictionary-en.db` as a release in our own repository. Set `DICT_RELEASE_BASE` and add the pin to `dict.env`.
- The dump is large. The build needs about 8 GB of memory and some hours. It runs on the owner's Mac, not on the server.
- Add `en` to `DICT_LANGS` and to the language pack, and test coverage against a 5,000-word list.

## Step 3: richer entries (like Oxford)

Today an entry has meanings, part of speech, IPA, etymology and related forms. It has no example sentences.

- Extend the dictionary schema with `examples` per sense. The Wiktionary dump already has them. This needs a schema version and a rebuild of each dictionary.
- Show in the drawer: headword, IPA with the speaker button, senses grouped by part of speech, one or two examples per sense, forms, then etymology folded.
- Examples stay in the learning language. A translation of the example is optional and goes through the same shared cache.
- The Enrich button keeps working for words the dictionary does not have.

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
- Is a dictionary build on the owner's Mac acceptable for step 2?
