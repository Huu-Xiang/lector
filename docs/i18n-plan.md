# Readfox i18n and native-language plan

Three independent language settings. Keep them separate in code and in the data model.

| Setting | Meaning | Where it lives |
| --- | --- | --- |
| `targetLanguage` (exists) | The language being learned | `settings`, per account |
| `nativeLanguage` (new) | The language translations, explanations and chat answers use | `settings`, per account; default from `uiLanguage` |
| `uiLanguage` (new) | The language of buttons, menus and pages | cookie `NEXT_LOCALE` (anonymous) + `settings` (signed in) |

## Native language (first, backend only)

- Prompts in `api/src/lib/translate-prompts.ts`, `routes/chat.ts`, `lib/journal-correct.ts`, `lib/word-classifier.ts` take a `nativeLanguage` name instead of the literal "English".
- One registry of supported native languages (`code`, English name, native name) shared by API and UI.
- Offline dictionary glosses stay English. They are shown as-is; AI glosses follow `nativeLanguage`.

## UI language (next-intl without locale routing)

- Library: `next-intl`, locale from the `NEXT_LOCALE` cookie, else `Accept-Language`, else `en`. No `/zh/...` URL prefixes: the app is behind a login and the public pages stay on one URL.
- Catalogs: `messages/<locale>.json`, nested by area (`auth`, `setup`, `reader`, `practice`, `settings`, `landing`, `legal`). `en.json` is the source; a missing key falls back to English at runtime.
- ICU message format for plurals and interpolation. No string concatenation for translatable text.
- Language names are rendered with `Intl.DisplayNames` in the UI locale. Dates and numbers use `Intl`. Right-to-left locales set `dir` on `<html>`.
- Guard rails: a vitest test fails when a locale has keys that `en.json` lacks (or the reverse), and an ESLint rule flags literal user-visible strings in JSX in converted areas.
- Legal pages: the English text is authoritative. A translation states that.
- Emails (verification, reset, deletion) pick their language from the account's `uiLanguage`.

## Rollout order

1. `nativeLanguage` setting, prompts, onboarding question. Ship.
2. i18n infrastructure and the language switcher, with `en` only. Ship.
3. Convert areas one at a time, shipping each: auth + setup + landing, reader, practice + vocab, settings + journal, legal.
4. Add `zh-CN`, then other locales. New locales are a catalog file plus an entry in the locale registry.

## English as a target language

A new language pack (`languages/en`): manifest, tokenizer, dictionary source, frequency list, starter content. Separate from the work above.
