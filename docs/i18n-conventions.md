# Converting UI text to translations

Library: `next-intl`. English is the source language; `zh-CN`, `zh-TW`, `ja` and `ko` are the other catalogs (listed in `src/i18n/locales.ts`).

## Files

- Edit only your own fragment: `messages/src/<locale>/<area>.json` for `en`, `zh-CN`, `zh-TW`, `ja` and `ko`. All of them must hold exactly the same keys.
- Never edit the merged `messages/<locale>.json` files. Run `node scripts/merge-messages.mjs` to rebuild them (it fails on a duplicate key across fragments).
- Top-level key of a fragment = namespace, for example `library`, `reader`. Use your area name as the first segment so fragments never collide.

## In code

- Client component: `const t = useTranslations('library');` then `t('importButton')`. Nested keys use dots: `t('empty.title')`.
- Server component or async page: `const t = await getTranslations('library');`.
- Variables: `t('count', { count })` with the message `"{count} words"`.
- Plurals: `"{count, plural, one {# word} other {# words}}"` in English. In zh-CN, zh-TW, ja and ko use plain text such as `"{count} 个词"`, `"{count} 個詞"`, `"{count} 語"`, `"{count}개"` (no plural forms needed).
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

## Traditional Chinese style

Traditional Chinese (`zh-TW`) uses Taiwan wording, not a character-by-character conversion of zh-CN. Terms: 書庫 (Library), 課文 (lesson), 詞彙 (vocabulary), 練習 (practice), 日記 (journal), 統計 (statistics), 設定 (settings), 帳號 (account), 軟體 (software), 資料 (data), 儲存 (save), 影片 (video), 登入/登出 (sign in/out), 間隔重複 (spaced repetition), 克漏字 (cloze), 翻譯語言 (translation language). Quote with 「」. Keep placeholders and tags unchanged. Browsers with `zh-TW`, `zh-HK`, `zh-MO` or `zh-Hant` match it; other Chinese tags match `zh-CN`. A book title or description with no `zh-TW` text shows the `zh-CN` text (`translationFor` in `src/lib/display-language.ts`).

## Japanese and Korean style

Japanese: です/ます for sentences, short nouns for buttons. Terms: ライブラリ, レッスン, 単語帳, 練習, 日記, 統計, 設定, 間隔反復, 翻訳言語, 復習.
Korean: 해요체 for sentences. Terms: 서재, 레슨, 단어장, 연습, 일기, 통계, 설정, 간격 반복, 번역 언어, 복습. Plan names stay in English in both.

## Check before you finish

`npx tsc --noEmit`, `npx prettier --write <files you touched>` (never the whole tree), `node scripts/merge-messages.mjs`, `npx vitest run src/i18n`.
