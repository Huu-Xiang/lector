# Readfox handoff

This file tells a new contributor or agent how Readfox differs from upstream Lector, and where each part lives. It holds no secrets and no server details. `AGENTS.md` has the working rules.

## What Readfox is

A public, multi-user language-reading app at https://readfox.app. It is a self-managed fork of `heuwels/lector` (AGPL-3.0). Work happens on branch `selfhosted`. The first goal is a free launch: users bring their own AI key and get a small built-in AI allowance. Paid plans come later.

## Map

| Area | Where |
| --- | --- |
| Reader, drawer, word marks | `src/components/MarkdownReader`, `WordCell`, `TranslationDrawer`, `src/app/read/[bookId]/page.tsx` |
| Sidebar, language picker, AI quota ring | `src/components/NavHeader`, `LanguageSelector`, `NavHeader/components/AiQuota` |
| UI text | `messages/src/<locale>/*.json`, merged by `scripts/merge-messages.mjs` |
| Language packs | `languages/<code>/manifest.ts`, `languages/registry.ts`, `languages/native.ts` |
| Word lookup | `api/src/routes/dictionary.ts`, `api/src/routes/translate.ts`, `src/lib/dictionary-client.ts`, `src/lib/claude.ts` |
| AI provider | `api/src/lib/llm/` |
| Plans and limits | `api/src/lib/entitlements.ts` |
| Shared caches | `api/src/lib/gloss-cache.ts`, `api/src/lib/entry-cache.ts` |
| Free books | `languages/<code>/content/library/` (book folders plus `translations.json`: title and blurb in all 16 native languages), `scripts/build-library-books.py`, `api/src/routes/library.ts`. At least 3 books per CEFR level for French and English (test-enforced). |
| Reading feed | Fresh, license-cleared articles for the learner's interests (`readingInterests` setting, set in setup). `api/src/lib/reading-feed/` (sources, level heuristic, background refresher, `reading_feed` table), `api/src/routes/reading-feed.ts`, tabs in `FreeBooksModal`. Sources: Global Voices (news), Wikivoyage (travel), Simple Wikipedia + Vikidia (science), each CC-licensed; `en`/`fr` only today. |
| Setup and recommendations | `src/app/setup/page.tsx` (stages `form` and `recommend`), `src/components/RecommendedForYou`, `src/app/(index)/components/HomeRecommendations`, `src/lib/recommend.ts`. `SETUP_READY_LANGUAGES` gates the languages (production: `en,fr`). |
| Reading level | Setup asks for a CEFR level and saves it per target language (`readingLevels` setting). The free-books dialog groups by level and opens on it. Exam equivalents: `src/lib/reading-level.ts`; mainland Chinese exams show only for the zh-CN interface or a mainland time zone. |
| Admin | `api/src/routes/admin.ts`, `src/app/admin/page.tsx` |
| Public pages | `src/app/{landing,privacy,terms,about}`, text in `messages/src/*/legal.json` |
| Deploy files | `deploy/readfox/` |

## Decisions that are easy to undo by mistake

- **Self-managed plan.** `LECTOR_SELF_MANAGED=1` makes every account resolve to plan `cloud`, so the limits from `LECTOR_PLAN_LIMITS` apply and a user's own key works. Raising a limit above the code default needs a code change.
- **No operator access to user content.** The admin export and "view as user" features were removed on purpose. Do not add them back. The admin list shows masked emails and no names. Showing a full email writes an audit entry. Keep the privacy text in step with any change here.
- **No third-party trackers.** Lifecycle emails are off unless `LIFECYCLE_EMAILS=1`.
- **Billing.** Paddle only. Tiers Free / Plus / Pro / Max map to plan ids `free` / `cloud` / `plus` / `max`. Turning `LECTOR_BILLING=paddle` on without `LECTOR_FREE_TIER=true` locks every account that has no subscription and is not exempt.
- **Books come from public catalogs.** Do not write book text by hand. Each level A1 to C2 should have a book in each language.
- **Three language settings stay separate:** interface locale (cookie), own language `nativeLanguage`, learning language `targetLanguage`.

## Word lookup, in order

1. On-device dictionary (`/api/dictionary/lookup`). Free. Meanings are English.
2. If the own language is not English, `/api/translate/localize` translates those meanings once and stores them in `shared_entry_cache`. It does not use the monthly allowance. A burst limit applies.
3. If the dictionary has no entry, `/api/translate/gloss` streams a short AI meaning. It uses the monthly "word translation" allowance unless `shared_gloss_cache` has the answer.
4. "Enrich" and phrase translation use the "detailed AI answers" allowance. When `OPENAI_COMPAT_PHRASE_RICH_MODEL` is set, phrase translation runs on that cheaper model, and its prompt asks for no idiom origins (small models invent them).

The plan for any language pair, English dictionary and example sentences is in `docs/lookup-languages-plan.md`.

## Data sources and licences

- Books: Project Gutenberg, public domain in the United States. Each manifest links to its source page.
- Reading feed articles: Global Voices (CC BY 3.0), Wikivoyage (CC BY-SA 3.0), Simple Wikipedia and Vikidia (CC BY-SA 4.0). VOA Learning English and Wikinews were tried and dropped — VOA stopped publishing after the March 2025 USAGM funding cuts, and Wikinews went read-only on 2026-05-04.
- Dictionaries: English Wiktionary through kaikki.org (CC BY-SA). Sentences: Tatoeba (CC BY 2.0 FR). Credit new sources on the About page when you add them.
- Oxford, Collins, Cambridge and similar dictionaries are copyrighted. Do not ship them.

## Checks before a push

```bash
node scripts/merge-messages.mjs --check
npx tsc --noEmit
npx vitest run
npm run build
cd api && bun run test            # long; one file: DATA_DIR=.test-data bun test <file>
npm run gen:openapi:check         # after any new or changed API route
```

Format only the files you changed with `npx prettier --write <files>`.

## Deploy

Push to `selfhosted`. GitHub Actions builds `ghcr.io/huu-xiang/lector:sha-<commit>`. Then run the server's `deploy.sh <commit-sha>` (see `deploy/readfox/deploy.sh` and `deploy/readfox/README.md`). Never run two deploys at once.

## Open work

The owner keeps the dated task list outside the repo. The main open items are the English dictionary and example sentences, credits for dictionary sources, mobile quota display, a whole-book glossary for the free library, global AI rate limiting, and the AI points system (standard and advanced modes), redeem codes and top-up packs.
