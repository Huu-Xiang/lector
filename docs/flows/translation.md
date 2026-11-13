# Translation domain

The iOS sheet puts the first definition and the original sentence before expandable dictionary details. The state and source are available under More actions.

This domain looks up a word or phrase and shows the drawer. The tap starts in the Reader. Save of the gloss is the Vocabulary domain.

The large language model (LLM) path uses a plan meter. A dictionary hit does not. For a word in a sentence, the drawer can request a short explanation of that use. The result displays above the original sentence and leaves the general definition available.

## Translate word

**App domain:** Translation

The user taps a word in the reader, a transcript, Listen-along, or a cloze card. The drawer opens at once and shows a load state.

On iOS, each part-of-speech label starts on the same line as its first definition. The lookup sheet keeps the save action in its footer and groups secondary actions under More actions. The handle toggles between two heights on tap. A downward drag collapses the expanded sheet or dismisses the compact sheet.

### Path

```mermaid
flowchart TD
  tap[User taps word] --> cell[WordCell.onActivate]
  cell --> block[ReaderArticle.onWordClick]
  block --> handle[ReadPage.handleWordClick]
  handle --> speak[tts.speak]
  handle --> stats["incrementDailyStat dictionaryLookups"]
  handle --> vocab[getVocabByText]
  handle --> dict[lookupWordRemote]
  dict --> session{Session cache?}
  session -->|hit| entry[ExpandedDictionaryEntry or null]
  session -->|miss| getDict["GET /api/dictionary/lookup"]
  getDict --> resolve[dictionary-db.lookupWord]
  resolve --> entry
  entry --> hit{Senses present?}
  hit -->|yes| drawer[TranslationDrawer]
  hit -->|no| saved{Vocab translation?}
  saved -->|yes| drawer
  saved -->|no| gloss[streamWordGloss]
  gloss --> postGloss["POST /api/translate/gloss"]
  postGloss --> stream[provider.stream task word-gloss]
  stream --> drawer
```

### Lookup order on the server

`lookupWord` in `api/src/lib/dictionary-db.ts` calls `resolveWord`. Order:

1. Exact key in `dictionary-{lang}.db` `entries`.
2. Inflection table. Then the lemma row.
3. Language rules. Esperanto uses morphology. The Koine-Greek pack (`grc`) folds marks. Afrikaans strips affixes.
4. User cache in `cached_entries`.

If the pack file does not exist, the curated steps skip. Only the user cache can hit.

### Key files

| Role | Path | Function |
| --- | --- | --- |
| Reader page | `src/app/read/[bookId]/page.tsx` | `handleWordClick` |
| Practice page | `src/app/practice/page.tsx` | `handleWordClick` |
| Word tap | `src/components/WordCell/index.tsx` | `onActivate` |
| Sentence | `src/components/MarkdownReader/ReaderArticle.tsx` | `findSentence` |
| Drawer | `src/components/TranslationDrawer/index.tsx` | `TranslationDrawer` |
| Gloss UI | `src/components/TranslationDrawer/components/Gloss/index.tsx` | `Gloss` |
| Dict client | `src/lib/dictionary-client.ts` | `lookupWordRemote` |
| LLM client | `src/lib/claude.ts` | `streamWordGloss`, `translateGloss` |
| Fold | `src/lib/languages.ts` | `foldWord` |
| API dict | `api/src/routes/dictionary.ts` | `GET /lookup` |
| API gloss | `api/src/routes/translate.ts` | `POST /gloss` |
| Dict engine | `api/src/lib/dictionary-db.ts` | `lookupWord`, `resolveWord` |
| Prompt | `api/src/lib/translate-prompts.ts` | `buildGlossPrompt` |
| LLM | `api/src/lib/llm/index.ts` | `getProvider` |

Practice uses `translateGloss`. That is the same `/gloss` route with no stream UI.

### Branches

- A phrase with a space takes the phrase path. See [Phrase selection](#phrase-selection).
- If the user taps again, `translationRequestId` drops stale results.
- A session cache key is `${language}:${foldWord}`. If the user reloads the page, the cache is empty.
- The client does not cache transport errors on lookup.
- Managed Free counts each gloss with `wordGlossesPerMonth` and a burst of 30 per 60 seconds.
- Bring-your-own-key (BYOK) counts gloss with `llmRequestsPerMonth`. There is no burst limit.
- CJK tap uses stored `segmentWords`. Phrase drag needs a space, so it does not apply to unspaced CJK.

### Tables

Curated pack: `data/dictionary-{lang}.db` (`entries`, `senses`, `related_forms`, `inflections`).

User database: `cached_entries`, `cached_senses`, `cached_related_forms`, `vocab`, `dailyStats`, `usage_counters`.

### Tests

`e2e/translation-drawer.spec.ts`, `e2e/reader-streaming-gloss.spec.ts`, `e2e/translation-cache.spec.ts`.

## In-context translation

**App domain:** Translation

The In-context action asks the LLM for a sense that fits the sentence. When the word occurs in that sentence, the drawer shows the control.

```mermaid
sequenceDiagram
  actor User
  participant Drawer as TranslationDrawer
  participant Read as ReadPage
  participant Claude as claude.ts
  participant API as translate.ts
  participant LLM as getProvider

  User->>Drawer: Click In context
  Drawer->>Read: onRequestContextTranslation
  Read->>Claude: explainWordInContext(word, sentence)
  Claude->>API: POST /api/translate with explainContext
  API->>API: reserve entitlements
  API->>LLM: complete task context-simple
  LLM-->>Read: explanation in the user's translation language
  Read->>Drawer: explanation and original sentence
```

### Key files

| Role | Path | Function |
| --- | --- | --- |
| Drawer | `src/components/TranslationDrawer/index.tsx` | `onRequestContextTranslation` |
| Reader | `src/app/read/[bookId]/page.tsx` | `requestContextTranslation` |
| Practice | `src/app/practice/page.tsx` | `requestContextTranslation` |
| Client | `src/lib/claude.ts` | `explainWordInContext`, `translateWord` |
| Sentence test | `src/lib/words.ts` | `sentenceContainsWord` |
| API | `api/src/routes/translate.ts` | `POST /` |
| Prompt | `api/src/lib/translate-prompts.ts` | `buildContextExplanationPrompt` |

### Branches

- Nested lookup keeps the original sentence. If the nested word is not in that sentence, the drawer hides the In-context action.
- Practice replaces the shown gloss and clears `dictEntry`.
- Managed Free meters `contextTranslationsPerDay` for context explanations.
- Paid and BYOK use `llmRequestsPerMonth` for context explanations.
- Managed Free burst for this route is `detail` (10 per 60 seconds).

## Phrase selection

**App domain:** Translation

The user selects two or more words. The reader snaps to word bounds and calls `onWordClick` with the phrase.

A mouse drag makes a browser selection. A touch drag makes none, and it sends no
`mouseup`, so touch input has its own gesture. Hold one word for 350 ms, then
drag across the phrase. Both paths end in `lookUpPhrase`.

```mermaid
flowchart TD
  drag[Mouse up on a selection of two or more words] --> snap[snapToWordBoundaries]
  hold[Touch hold, then drag across words] --> spans[usePhraseTouchSelection]
  spans --> range[readableRangeText between the end words]
  snap --> look[lookUpPhrase]
  range --> look
  look --> sentence[findSentence]
  sentence --> handle[handleWordClick]
  handle --> cap{phraseSelectionWords?}
  cap -->|over cap| toast[Plan toast, stop]
  cap -->|ok| vocab{Vocab translation?}
  vocab -->|yes| drawer[Show phrase in drawer]
  vocab -->|no| phrase[translatePhrase]
  phrase --> post["POST /api/translate type=phrase"]
```

| Role | Path | Function |
| --- | --- | --- |
| Reader | `src/components/MarkdownReader/index.tsx` | `handleMouseUp`, `snapToWordBoundaries`, `lookUpPhrase` |
| Reader touch | `src/components/MarkdownReader/usePhraseTouchSelection.ts` | `usePhraseTouchSelection` |
| Reader page | `src/app/read/[bookId]/page.tsx` | `handleWordClick` |
| Client | `src/lib/claude.ts` | `translatePhrase` |
| Limits | `src/lib/plan-limits.ts` | `phraseSelectionLimitPayload` |
| API | `api/src/routes/translate.ts` | `POST /` |
| Prompt | `api/src/lib/translate-prompts.ts` | `buildSimplePhrasePrompt`, `buildPhrasePrompt` |
| Afrikaans rules | `api/src/lib/spelreels.ts` | `getSpelreelsContext` |

Managed Free uses a short phrase prompt and `phraseTranslationsPerDay`. For paid Afrikaans, the prompt adds spelreels from `api/src/lib/afrikaans-spelreels/`. Phrase save does not write the dictionary cache.

Tests: `e2e/reader-phrase-selection.spec.ts`, `e2e/reader-phrase-touch.spec.ts`.

## Enrich and nested lookup

**App domain:** Translation

**Enrich** upgrades a bare gloss to senses, IPA, etymology, and related forms. Free managed allowance for this route is 0.

| Role | Path | Function |
| --- | --- | --- |
| Reader | `src/app/read/[bookId]/page.tsx` | `enrichTranslation` |
| Client | `src/lib/claude.ts` | `enrichWord` |
| API | `api/src/routes/translate.ts` | `POST /enrich` |
| Prompt | `api/src/lib/translate-prompts.ts` | `buildWordEntryPrompt` |

**Nested lookup** follows a form-of link in a gloss.

| Role | Path | Function |
| --- | --- | --- |
| Links | `src/lib/definition-links.ts` | `findNestedWordRef` |
| Button | `src/components/TranslationDrawer/components/NestedWordButton/index.tsx` | `NestedWordButton` |
| Reader | `src/app/read/[bookId]/page.tsx` | `handleNestedLookup` |

`handleNestedLookup` calls `handleWordClick(nestedWord, wordPanel.sentence)`. The call keeps the original sentence. A save after that still records the encounter.

Tests: `e2e/nested-definitions.spec.ts`.

English lookups in Russian have a short list of reviewed internet slang in `api/src/lib/russian-english-slang.ts`. Quick glosses use it before the shared cache. Enrichment keeps its plan gate and serves the reviewed senses without an AI charge. The contextual translation prompt uses these senses to choose the one that fits the sentence.

Dictionary lookups depend on both the text's language and the learner's translation language. The browser caches the two together. In the reader, if localization takes more than eight seconds, show the English dictionary entry while waiting. Replace it when the localized senses arrive for the same open lookup. Auto-save waits for those senses.

## Lesson prefetch

**App domain:** Translation

When a learner opens a lesson, the reader sends single dictionary words from that lesson to `POST /api/translate/prefetch`. The server translates the meanings of the hardest ones into the learner's language before any tap.

```mermaid
flowchart TD
  open[Lesson opens] --> pick[pickPrefetchCandidates]
  pick --> client[prefetchLocalizedSenses]
  client --> post["POST /api/translate/prefetch"]
  post --> select[selectPrefetchWords: rank above learner band]
  select --> cache{Shared cache hit?}
  cache -->|yes| reply[Senses in reply]
  cache -->|no| ai[localizeEntry, label prefetch]
  ai --> reply
  reply --> map[Client map, 500 words]
  tap[User taps word] --> hit{In map?}
  hit -->|yes| drawer[Drawer fills at once]
  hit -->|in flight| wait[Await the same request]
  wait --> drawer
  hit -->|no| localize["POST /api/translate/localize"]
```

| Role | Path | Function |
| --- | --- | --- |
| Word pick | `src/lib/prefetch-words.ts` | `pickPrefetchCandidates` |
| Client | `src/lib/dictionary-client.ts` | `prefetchLocalizedSenses`, `localizeEntrySenses` |
| API | `api/src/routes/translate.ts` | `POST /prefetch` |
| Server logic | `api/src/lib/localize-prefetch.ts` | `prefetchLocalizations`, `selectPrefetchWords` |
| Shared path | `api/src/lib/localize-entry.ts` | `localizeEntry` |

- The server keeps at most 12 words and starts at most 4 new AI calls per request. A daily cap per user also applies.
- A prefetch never uses the monthly allowance or the learner's own key (BYOK).
- It does nothing for English readers. `LOOKUP_PREFETCH=0` turns it off.
- The client map holds 500 words and drops the oldest. A word already cached or in flight is not sent again.
- The privacy text names this send. Change both together.

Tests: `src/lib/dictionary-client.test.ts`, `src/lib/prefetch-words.test.ts`, `e2e/reader-lookup-prefetch.spec.ts`.

## Streamed phrase and context translation

**App domain:** Translation

A phrase or In-context request can ask for a stream (`stream: true` on `POST /api/translate`). The server answers with lines of JSON: `{"delta": text}` while the model writes, then `{"result": ...}`. The drawer shows the translation text as it grows.

| Role | Path | Function |
| --- | --- | --- |
| Client | `src/lib/translate-stream.ts` | `readTranslateStream` |
| Client | `src/lib/claude.ts` | `translatePhrase`, `translateWord` |
| Server | `api/src/lib/json-text-stream.ts` | `JsonTextExtractor` |
| API | `api/src/routes/translate.ts` | `POST /` |

Tests: `src/lib/translate-stream.test.ts`, `api/src/lib/json-text-stream.test.ts`, `e2e/reader-streaming-translation.spec.ts`.

## AI timing

**App domain:** Translation

Every AI call and every cache or dictionary hit adds to anonymous daily counters in `ai_timing_daily` (`api/src/lib/ai-timing.ts`). A row has a UTC date, a key such as `gloss.total`, a latency bucket and a count. It holds no user id, text or IP. Rows older than 90 days are deleted.

- The label comes from the task: `gloss`, `phrase`, `context`, `enrich`, `chat`, `lookup`, `other`.
- `withTimingLabel` overrides the label for a code path. `localize` covers the tap path. `prefetch` covers lesson prefetch, so its calls and hits do not mix into `localize`.
- The admin page shows the table (see [Admin AI timing](admin.md#ai-timing)).

Tests: `api/src/lib/ai-timing.test.ts`, `api/src/routes/translate.test.ts`.

## Cache accepted translation

**App domain:** Translation

When the user marks Known, sets a level, or adds to Anki, the client stores a trusted AI gloss. Next tap can hit `cached_entries` and skip the LLM.

```mermaid
flowchart TD
  accept[Known, level 1 to 4, or Anki] --> persist[persistAcceptedTranslation]
  persist --> skip{Phrase or dict hit?}
  skip -->|yes| stop[No cache write]
  skip -->|no| cache[cacheAcceptedTranslation]
  cache --> inv[invalidateLookupCache]
  cache --> post["POST /api/dictionary/cache"]
  post --> write[cacheAcceptedEntry]
```

| Role | Path | Function |
| --- | --- | --- |
| Reader | `src/app/read/[bookId]/page.tsx` | `persistAcceptedTranslation` |
| Client | `src/lib/dictionary-client.ts` | `cacheAcceptedTranslation`, `invalidateLookupCache` |
| API | `api/src/routes/dictionary.ts` | `POST /cache` |
| Engine | `api/src/lib/dictionary-db.ts` | `cacheAcceptedEntry` |

Ignore does not write the cache. A cache hit shows the learned pill.

Tests: `e2e/translation-cache.spec.ts`.
