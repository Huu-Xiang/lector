# Converting UI text to translations

Library: `next-intl`. English is the source language; `zh-CN` is the second catalog.

## Files

- Edit only your own fragment: `messages/src/en/<area>.json` and `messages/src/zh-CN/<area>.json`. Both files must hold exactly the same keys.
- Never edit `messages/en.json` or `messages/zh-CN.json`. Run `node scripts/merge-messages.mjs` to rebuild them (it fails on a duplicate key across fragments).
- Top-level key of a fragment = namespace, for example `library`, `reader`. Use your area name as the first segment so fragments never collide.

## In code

- Client component: `const t = useTranslations('library');` then `t('importButton')`. Nested keys use dots: `t('empty.title')`.
- Server component or async page: `const t = await getTranslations('library');`.
- Variables: `t('count', { count })` with the message `"{count} words"`.
- Plurals: `"{count, plural, one {# word} other {# words}}"` in English. In zh-CN use `"{count} 个词"` (no plural forms needed).
- Markup inside a sentence: message `"Read the <link>privacy policy</link>."` and `t.rich('key', { link: (chunks) => <Link href="/privacy">{chunks}</Link> })`.
- Dynamic keys: ``t(`levels.${value}`)`` is fine; add every possible key.
- Dates and numbers: `useFormatter()` or `Intl` with `useLocale()`. Do not hard-code `'en-US'`.
- Language names: `new Intl.DisplayNames([locale], { type: 'language' }).of(code)`.

## What to convert

Everything a user reads: headings, labels, buttons, placeholders, `aria-label` and `title` text, toast messages, error messages, empty states, confirm dialogs (`window.confirm`).

## What not to touch

- `data-testid`, class names, route paths, API field names, setting keys, event names, console messages, comments.
- Language names written in their own language (`lang.native`), product name `Readfox`, brand names (GitHub, OpenRouter, Anthropic, Anki).
- The text of an English string. e2e tests match English text, so the English catalog must say exactly what the code said before.
- Text sent to an AI model (prompts) and text produced by the API.

## Chinese style

Simplified Chinese, natural and short, the way a mainstream app would say it. Keep terms consistent: 书库 (Library), 课文 (lesson), 词汇 (vocabulary), 练习 (practice), 日记 (journal), 统计 (statistics), 设置 (settings), 间隔重复 (spaced repetition), 母语/翻译语言 (translation language). Keep placeholders and tags unchanged.

## Check before you finish

`npx tsc --noEmit`, `npx prettier --write <files you touched>` (never the whole tree), `node scripts/merge-messages.mjs`, `npx vitest run src/i18n`.
