# Prepared books (design, not built)

Goal: lookups inside a book feel instant and cost no tokens at read time. Do not translate the whole text. Pre-compute one gloss per distinct word form instead.

## Two cases

| Case | Where it is stored | Who pays |
| --- | --- | --- |
| Free-library books (public domain, shared by everyone) | `library_glossary(slug, language, nativeLanguage, form, gloss)`, one copy | The operator, once per book and language pair, on first demand |
| A user's own uploaded book (private) | `book_glossary(userId, collectionId, language, nativeLanguage, form, gloss)` | Premium feature, counted against a monthly allowance |

A private book never feeds a shared table.

## How a book is prepared

1. Tokenize the lessons with the language pack and collect the distinct word forms (a novel has roughly 5,000 to 9,000).
2. Drop forms the offline dictionary already answers and forms already in `shared_gloss_cache`.
3. Send the rest in batches of about 40, each with one example sentence from the book, to the cheap model (`word-gloss` task) and ask for strict JSON.
4. Store the answers. A background worker runs two batches at a time and is resumable; the UI shows progress.

Rough cost for 7,000 forms: about 175 calls of 1.6k input and 0.8k output tokens, so roughly 280k input and 140k output tokens. At the Qwen3.7 Flash list price that is about three cents per book and language pair. Check current prices before quoting this to anyone.

## Reading

The reader asks the book glossary first, then the offline dictionary, then `shared_gloss_cache`, then the model. A glossary hit costs no quota.

## Premium only while subscribed

- New plan limit `preparedBooksPerMonth` (0 on Cloud, a small number on Plus).
- The glossary is served only while the entitlement is active when the word is looked up. Rows stay for 90 days after a lapse and are then purged; re-subscribing inside that window restores access.
- Preparing needs a plan that grants the limit, so this waits for a billing path (`LECTOR_BILLING=paddle` or a replacement).

## Order

1. Library glossary for the shipped books (no billing needed; shared, one-off cost).
2. Premium private-book preparation, after plans exist.
