# Vocabulary domain

On iOS, the word list follows a compact total. Expand the total to see the breakdown by word state.

This domain stores entries that the user owns. It also stores the known-word map. The reader uses `knownWords` for colour. The vocab list uses `vocab`. A save writes both.

## Save vocab and set word state

**App domain:** Vocabulary

Add to vocabulary or keyboard `S` saves a word at level 1. A level, Known, Ignore, or Add to Anki also creates or updates a row. Undo restores the word’s prior vocabulary state from the current lookup.

```mermaid
flowchart TD
  action[Add to vocabulary, level, Known, Ignore, S, or Anki] --> apply[ReadPage.applyReaderWordState]
  apply --> patch[patchWordState optimistic colour]
  apply --> row{Vocab row exists?}
  row -->|no| save[saveVocab POST /api/vocab]
  row -->|yes| put[updateVocabState PUT /api/vocab/:id]
  save --> both[Upsert vocab and knownWords]
  put --> both
  action --> cache[persistAcceptedTranslation]
  cache -.-> translation.md
```

### Lookups and saving

By default a lookup only opens the definition. In a reader session, a second lookup of an unsaved word at a different position can show a one-time hint beside Add to vocabulary.

### Auto-save of looked-up words

Only when the setting `autoSaveLookups` is `true`, the reader saves a looked-up single word once its meaning arrives. The setting loads first. A failed read or an unloaded setting means no auto-save.

- The save is silent. It never changes a word that already has a state, and a failure shows nothing.
- One save runs per word at a time (`createKeyedGuard`). Key `S` pressed during an auto-save does not post a second row.
- Nested lookups do not auto-save. The guide shows a separate save step when auto-save is off.

| Role | Path | Function |
| --- | --- | --- |
| Reader | `src/app/read/[bookId]/page.tsx` | `saveWordToVocab`, `saveWordNow` |
| Rules | `src/lib/auto-save-lookups.ts` | `resolveAutoSave`, `createKeyedGuard` |

Keyboard: `K` marks Known. Keys `1` to `4` set levels. `X` marks Ignore. IME compose skips these keys.

### Key files

| Role | Path | Function |
| --- | --- | --- |
| Reader | `src/app/read/[bookId]/page.tsx` | `setWordLevel`, `markAsKnown`, `ignoreWord`, `saveWordToVocab`, `applyReaderWordState` |
| Colour | `src/components/MarkdownReader/optimistic-word-state.ts` | `patchWordState` |
| Client | `src/lib/data-layer.ts` | `saveVocab`, `updateVocabState`, `getVocabByText` |
| API | `api/src/routes/vocab.ts` | `POST /`, `PUT /:id` |
| Fold | `src/lib/languages.ts` | `foldWord` |

`POST /api/known-words` is not on the drawer path. The reader colours from `GET /api/known-words` at lesson load, then from the optimistic map.

Ignore does not write the translation cache. Known and levels do, for single words with no dict hit. See [translation.md](translation.md#cache-accepted-translation).

A Mastered bank word becomes known on the server: `POST /api/cloze/:id/review` calls `syncWordState`. The client no longer calls `updateWordState` for it.

### Word state writes

`syncWordState` (`api/src/lib/review/sync-word-state.ts`) is the single writer of word state. It writes `vocab.state`, `knownWords` and the word card (`wordCards`) together, by the source of the change:

- `reader`: levels seed the FSRS state. Known or Ignore retires the card.
- `import` and `anki`: an incoming known state keeps a Mastered card active.
- `restore`: the same rule as import.
- `review`: updates every vocab row that folds to the word.

Vocab create, update and delete, the known-words import, Anki back-sync, restore and bank cloze reviews all call it. See [Word review](practice.md#word-review). Do not write `vocab.state` or `knownWords` anywhere else.

### Word states

`new`, `level1`, `level2`, `level3`, `level4`, `known`, `ignored`.

### Tables

`vocab`, `knownWords`, `wordCards`, `dailyStats` (`newWordsSaved`, `wordsMarkedKnown`).

## Vocab list

**App domain:** Vocabulary

| Role | Path | Function |
| --- | --- | --- |
| Page | `src/app/vocab/page.tsx` | `loadData`, `handleUpdateEntry`, `handleDeleteEntry` |
| List | `src/components/VocabList/index.tsx` | `VocabList` |
| Modal | `src/app/vocab/components/VocabDetailModal.tsx` | `handleSave` |
| Client | `src/lib/data-layer.ts` | `getAllVocab`, `updateVocabEntry`, `deleteVocabEntry` |
| API | `api/src/routes/vocab.ts` | `GET /`, `PUT /:id`, `DELETE /:id` |

Filter and page run in memory. `GET /api/vocab` has no `limit`. Delete of the last vocab row for a folded key also deletes `knownWords`.

Tests: `e2e/vocab-edit.spec.ts`, `e2e/vocab-pagination.spec.ts`.

## Known-word import

**App domain:** Vocabulary

Settings, Import Known Words. A plain list writes `knownWords` only. A LingQ CSV also writes `vocab`.

| Role | Path | Function |
| --- | --- | --- |
| UI | `src/app/settings/components/KnownWordsImport/index.tsx` | `importKnownWords`, `importLingQWords` |
| Parse | `src/app/settings/components/KnownWordsImport/utils.ts` | `parseCSVLine`, `lingqStatusToState` |
| Client | `src/lib/data-layer.ts` | `bulkUpdateWordStates`, `saveVocab` |
| API | `api/src/routes/known-words.ts` | `POST /` |

New rows have `domain IS NULL` until the classifier runs. See [stats.md](stats.md).

## Vocabulary test reports

**App domain:** Vocabulary

The public test calculates the result in the browser. It sends a result summary only when a reader chooses to save it to an account. The summary contains the estimate, level, test date and book references. Answers stay in the browser. The report history is private and uses the account session.

```mermaid
flowchart TD
  test[Public vocabulary test] -->|Save and get PDF| session[Verified account session]
  session --> report[Save result in SQLite]
  report --> pdf[Render one-page PDF]
  pdf --> delivery[Send to the verified email address]
  delivery -->|Failure| history[Keep saved result and show delivery state]
```

The API stores one report for each account and test attempt. The mail path uses a separate record and sends an attachment. An uncertain send uses the same request while the email service can deduplicate it. The reading level action remains separate.

The public test opens with three mid-frequency words, then samples near the adaptive target. The answer bar tracks the 8 questions needed to view a result. The estimate and its precision are shown separately.
