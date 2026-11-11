---
title: Vocabulary Test Word Pool - Plan
type: feat
date: 2026-11-11
topic: vocab-test-word-pool
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Vocabulary Test Word Pool - Plan

## Goal Capsule

- **Objective:** A learner who retakes the English vocabulary test at `/vocab-test` on the same device gets words they have not been tested on before, for about five or six tests, so a retake measures what they know rather than what they remember from the last feedback.
- **Product authority:** The site owner. Decisions below came from the owner in the 2026-11-11 dialogue.
- **Open blockers:** None.

---

## Product Contract

### Summary

Grow the test's word pool from 480 to about 6,000 curated words (about 375 per frequency band) and make each new test on a device prefer words that device has not been tested on yet. The word list loads when the test starts, so the page itself stays light.

### Problem Frame

Each of the 16 bands holds 30 words, and one test asks up to 120. A learner's own level sits in two or three bands, so a test uses most of the words there. Every answer now shows the right meaning, so a retake often asks words whose meaning the learner saw minutes ago. The retake estimate then rises from memory, not knowledge, and repeated tests stop meaning anything.

### Requirements

**Word pool**

- R1. Each of the 16 bands holds about 375 test words, about 6,000 in total, plus spare words that replace any word that fails a check.
- R2. Every word meets the same option rules as the current test: parts of speech, up to three Chinese meanings and one English line of 8 words or fewer per row, checked by the build (`docs/plans/2026-11-11-1612-feat-vocab-test-v3-plan.md` R5-R8). A word that fails is replaced by a spare.
- R3. A two-part-of-speech word stays in the pool only if it can get three wrong options with the same two-row shape, as today.

**No repeats across tests**

- R4. The test remembers, in this browser only, which test words have been asked in earlier tests.
- R5. When the next word is chosen, a word not asked before on this device wins over one asked before; an earlier-asked word is used only when no unasked word fits the target.
- R6. Wrong options keep preferring meanings not yet shown, now including meanings shown in earlier tests on this device.
- R7. Clearing browser data or using another device starts fresh; nothing about asked words is sent to the server.

**Loading**

- R8. Opening `/vocab-test` does not download the word list; it loads when the learner presses Start.
- R9. While the list loads, the Start button shows a loading state; if loading fails, the page says so and offers to try again.

**Accuracy and compatibility**

- R10. The question order and the estimate model stay as they are; the accuracy simulation is re-run on the new pool and must not be worse than the current results.
- R11. Saved results from earlier tests keep working.

### Key Decisions

- **About 6,000 words, not more.** The thinnest bands (for example 9,001-10,000 with 612 usable words) would otherwise need rarer, less standard words, and five or six non-repeating tests already exceed how often most people retake. (session-settled: user-approved — chosen over about 960, about 3,200, or more than 6,000: enough non-repeating retakes without filling the pool with marginal words) Governs R1.
- **Remember asked words on the device.** A bigger pool alone still repeats about a quarter of near-level words between two tests; remembering asked words is what makes retakes repeat-free. Governs R4, R5, R6, R7.
- **Sonnet drafts the meanings, Haiku spot-checks.** The meanings are graded answers, so drafting uses Sonnet; a cheaper Haiku pass checks a random sample and flags suspicious entries for review, and the build checks every entry. (session-settled: user-approved — chosen over Haiku drafting: Haiku makes more meaning mistakes on rare words) Governs R2.

### Success Criteria

- A simulated learner at any level from 1,000 to 20,000 words can take five tests of 60 answers on one device with no repeated test word.
- Opening `/vocab-test` transfers no more data than today before Start is pressed.
- Accuracy on the new pool matches the current results within simulation noise (inside-range share and bias at 40 and 80 answers).
- A random sample of 300 curated entries read by hand has no wrong meaning.

### Scope Boundaries

- Remembering asked words across devices for signed-in users: not in this work.
- More than about 6,000 words, or uneven pool sizes per band: not in this work; revisit with real retake data.
- Changes to the question order, the estimate model or the screen layout: not in this work.

### Outstanding Questions

**Deferred to Planning**

- How asked words are stored in the browser and whether old entries expire.
- How the word list is fetched on Start and cached for "answer more" and retakes.
- How the build's wrong-option check is made fast enough for 6,000 words.
- How many spares each band needs.

### Sources / Research

- Current build and pool selection: `scripts/build-vocab-test.py` (`build_bands`, `apply_glosses`, `distractor_count`); curated meanings in `scripts/vocab-test-glosses.json`.
- Question choice and wrong options: `src/lib/vocab-test.ts` (`nextItem`, `distractors`, `prepareNext`).
- Page and data loading: `src/app/vocab-test/page.tsx`, `src/lib/vocab-test-data.ts`, `src/components/VocabTest/index.tsx`; saved result in `src/lib/vocab-result.ts`.
- Usable words per band (pool rules, learner-list mark, a short gloss): 612 to 1,673 per band, measured on 2026-11-11.
- Accuracy check: `scripts/simulate-vocab-test.ts`.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Asked words are kept in `localStorage` as plain English words.** Key `lector-vocab-seen`, a JSON array, newest last, capped at 6,000 entries (oldest dropped first). No expiry: the cap keeps it small (about 50 KB at most). The set is read once when a test starts, so `nextItem` stays pure for a given seed and seen set. Governs R4, R7.
- **KTD2. A seen word costs a fixed distance penalty instead of being removed.** In `nextItem`, a seen word's log-rank distance gets `SEEN_PENALTY` (0.5) added. With about 375 words per band an unseen word almost always sits within that distance of the target, so seen words appear only when nothing unseen is near. Governs R5, R10.
- **KTD3. Wrong options skip both this test's asked words and earlier-seen words in their first passes.** The existing `allowAsked` loop gets one avoid set: this test's words plus the seen set. Governs R6.
- **KTD4. The word list is a static route at `/vocab-test/words`.** A `force-static` route handler reads `languages/en/content/vocab-test.json` at build time, so the file is served from the build output with caching, and Caddy's gzip applies. The page passes only the band limits and the source line to the client. Governs R8.
- **KTD5. The build reuses curated words and checks distractors locally.** Pool selection takes curated words in the band first, then fills by the existing seeded spread. The distractor check sorts the pool by rank once and walks outward from each word, with per-word sets cached, so it gives the same answer as before at a fraction of the time. Governs R1-R3.

### Implementation Units

- **U1. Build: bigger pool, fast check.** `scripts/build-vocab-test.py`: `POOL_SIZE = 375`, `SPARE_SIZE = 60`; curated words first in `build_bands`; `distractor_count` walks outward from the word's rank position with cached sets; `--draft` writes only uncurated words. Test: build passes, 16 bands of 375.
- **U2. Curation.** Sonnet subagents draft rows for the uncurated pool and spare words in batches of about 150 into `scripts/vocab-test-glosses.json`; a Haiku pass checks a 10% sample and flags errors for a fix; I read 300 entries. The build's checks are the gate.
- **U3. Library.** `src/lib/vocab-test.ts`: `nextItem(answers, data, seed, seen?)`, `prepareNext(..., seen?)`, distractors avoid seen words first. Unit tests: a seen word is skipped when an unseen word is near; repeated tests with a growing seen set have no repeats; seen meanings come last as wrong options.
- **U4. Page and component.** Route `src/app/vocab-test/words/route.ts`; `page.tsx` passes band limits and source; the component loads the list on Start (loading state, error with retry), keeps it for "answer more" and retake, reads the seen set at start and adds each answered word. `src/lib/vocab-seen.ts` holds the storage helpers. New message keys in all four locales. E2E: no list request before Start; failed load shows retry; a retake asks no repeated word.
- **U5. Simulation.** `scripts/simulate-vocab-test.ts` gets a repeat mode: five tests of 60 answers with a shared seen set, reporting repeats per learner level; the accuracy runs at 40 and 80 answers are repeated on the new pool.

Dependencies: U1 → U2 → U5; U3 → U4; U3 → U5.

### Verification Contract

- `npm test`, `npx tsc --noEmit`, lint on touched files, `npm run build`.
- `npx playwright test e2e/vocab-test.spec.ts` on spare ports.
- Simulation: zero repeated test words over five tests for learners from 1,000 to 20,000; inside-range share and bias within noise of the v3 numbers.

### Definition of Done

All units done, checks above pass, and the work is committed locally on `feat/vocab-test`. No push, no deploy.
