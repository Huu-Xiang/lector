# Agent Instructions

This repository is **Readfox**, a public, self-managed fork of `heuwels/lector` (AGPL-3.0). Work happens on the `selfhosted` branch; `origin` is `Huu-Xiang/lector`, `upstream` is `heuwels/lector`. The product name, logo, legal pages and deployment are Readfox's. Internal identifiers (`LECTOR_*` env vars, `useLectorMode`, `lector-*` localStorage keys, the Anki add-on) keep the upstream name on purpose so upstream merges stay small.

## Commands

- Frontend: `npm run dev` (UI on :3456), `npm run dev:api` (Hono on :3457, reads `.env.local`), `npm run build`, `npm run lint`, `npx tsc --noEmit`.
- Unit tests: `npm test` (vitest, frontend only). API tests: `cd api && bun run test` — never bare `bun test`; the script isolates `DATA_DIR=.test-data` and `src/test-guard.ts` aborts otherwise. One file: `cd api && DATA_DIR=.test-data bun test src/lib/entitlements.test.ts`. One vitest file: `npx vitest run path/to/file.test.ts`.
- E2E: `npm run test:e2e` (one spec: `npx playwright test e2e/<name>.spec.ts`).
- `npm run check` runs type check, unit tests and lint on changed files in parallel (`--build` adds `npm run build`). `scripts/ship.sh` pushes HEAD to `selfhosted`, waits for the image build, deploys it and checks the site; it needs `READFOX_HOST` and runs only after the owner approves a deploy.
- Always run `npm run build` before pushing frontend changes: the Docker build type-checks every file and fails on errors that `tsc --noEmit` can miss.

## Readfox fork: differences from upstream

- **Self-managed plans.** Without Paddle (`LECTOR_BILLING` unset), upstream resolves every account to `unlimited` and ignores BYOK keys. `resolvePlan()` in `api/src/lib/entitlements.ts` returns `cloud` instead when `LECTOR_MODE=cloud` and `LECTOR_SELF_MANAGED=1`, so `LECTOR_PLAN_LIMITS` (100 MB lesson text, audio 0) applies and a user's own key is used. Free-tier limits can only be lowered by env; raising them needs a code change in `DEFAULT_PLAN_LIMITS`.
- **Billing.** Only Paddle is implemented (`api/src/lib/paddle-billing.ts`, `routes/billing.ts`). Stripe would need a new integration that writes `billing_subscriptions` rows. A full refund or a chargeback (`adjustment.created` / `adjustment.updated`, status `approved`) ends the plan at once: the webhook marks the mirror `canceled` and cancels the subscription at Paddle with `effective_from: immediately`; a failed cancel answers 502 so Paddle sends the notice again. The Paddle notification destination must list the `adjustment.*` events. A partial refund keeps the plan. Readfox sells three paid tiers. Internal plan ids keep upstream's names: `cloud` is shown as **Plus**, `plus` as **Pro**, and `max` (Readfox-only) as **Max** (`src/lib/plan-names.ts`). Prices come from `PADDLE_PRICE_{,PLUS_,MAX_}{MONTHLY,ANNUAL}`. The overlay opens on `/checkout` in this app (`CHECKOUT_URL`, `PADDLE_CLIENT_TOKEN`, `PADDLE_ENV`). `GET /api/billing/prices` is public and shows Paddle's real amounts, including the China (CNY) override. With `LECTOR_SELF_MANAGED=1`, Free does not need OpenRouter, Gemini or Google voices; it needs only an explicit model for each Free task. When `OPENAI_COMPAT_FREE_MODEL` is also set, Free gets the rich answers of the paid tiers, metered by `llmRequestsPerMonth` (set it in `LECTOR_PLAN_LIMITS.free`), and `getProvider` sends every task of a Free account to that model. The allowances on the pricing surfaces (`TIER_ALLOWANCES` in `src/lib/plan-prices.ts`) mirror `DEFAULT_PLAN_LIMITS`; change both together. On self-managed deployments a stored own AI key counts only on a paid plan (`byokNeedsPaidPlan`).
- **RMB payments (Xiaodou).** One-time Alipay / WeChat Pay purchases of 1 or 12 months go through Xiaodou Pay (`api/src/lib/xiaodou.ts`, `routes/billing-cn.ts` under `/api/billing/cn`). A paid order writes a row to `plan_grants` (`lib/plan-grants.ts`): a tier for a fixed period, extended when the same tier is bought again. `resolvePlan` takes the highest tier across Paddle subscriptions and active grants. It uses Xiaodou's 易支付-compatible protocol (MD5 with the shared merchant key; `mapi.php` to create, `api.php?act=order` to query). The notice (`/api/billing/cn/webhook`, public, GET or form POST) and the order poll both settle an order; `ref` = order number keeps it to one grant. The protocol has no refund notice: after a refund in the Xiaodou portal, open `/admin`, choose the user's menu and pick "End paid plan (refund)" (`POST /api/admin/users/:id/end-grants`, `endGrants` in `lib/plan-grants.ts`). Settings: `XD_GATEWAY` (e.g. `https://pay.xiaodouap.cn`), `XD_PID`, `XD_KEY`, optional `XD_PRICES_FEN`, `XD_PUBLIC_ORIGIN`. All required ones set → the RMB option appears on /subscribe. The platform has no sandbox.
- **No operator access to user content.** The admin export and "view as user" endpoints and buttons were removed on purpose. Do not re-add them. Users export their own data from Settings → Learning data (`GET /api/data`, `lib/user-export.ts`).
- **No third-party trackers.** Upstream's Plausible component was deleted. Lifecycle emails (`lib/lifecycle-email.ts`) stay off unless `LIFECYCLE_EMAILS=1`, because their Resend templates live in upstream's account.
- **Public pages.** `/privacy`, `/terms`, `/about`, `/landing`, `/pricing` and `/checkout` render without a session or app chrome: they are listed in `AUTH_ROUTES` in `src/lib/api-base.ts`. The privacy text states what the service does; change it in the same commit as any change to data handling (new AI provider, new third party, new logging).
- **Landing redirect lives in Caddy, not in Next.** `deploy/readfox/Caddyfile` redirects `/` to `/landing` when no `better-auth.session_token` cookie is present. `sitemap.ts` and `robots.ts` list the public pages.
- **Setup.** `/setup` is a bare route (no sidebar, see `isBareRoute`). It asks for the native language (default: the interface locale), the language to learn, a CEFR level and reading interests. `SETUP_READY_LANGUAGES` (comma-separated codes, passed to the browser through `__env.js`) limits which languages can be chosen; the others show "In development". Unset means every language. Production sets it to `en,fr`. Without `SETUP_READY_LANGUAGES`, `src/app/setup/page.tsx` shows `POPULAR_LANGUAGES` first and hides the rest behind `setup-language-show-all`; e2e specs click that button before picking other languages. A language with starter lessons starts the guided lesson at once. Any other language shows `RecommendedForYou` (books near the level, one article per interest); the chosen item becomes the guided lesson. The same component shows on the library page while the library has fewer than three collections.
- **Passwords.** A new password needs 8 to 128 characters with a letter and a digit (`api/src/lib/password-rules.ts`, enforced by a better-auth hook on sign-up, reset and change; mirrored by `src/lib/password-strength.ts`). Register and reset ask twice and show `PasswordMeter`.
- **CI.** Upstream's `docker.yml`/`release.yml` (AWS deploy) were removed. `.github/workflows/build-image.yml` builds `ghcr.io/huu-xiang/lector:sha-<commit>` for amd64 on every push to `selfhosted`. The paragraphs below about `release.yml` describe upstream only.
- **Deployment.** Production is one VPS running `deploy/readfox/docker-compose.yml` (lector, caddy, litestream) in `/srv/lector`. Deploy by running `/srv/lector/deploy.sh <commit-sha>` on the server (copy of `deploy/readfox/deploy.sh`). It sets `LECTOR_VERSION`, pulls, restarts, and removes old Lector images except the previous one (rollback). Secrets live only in the server's `.env` / `.env.backup`; never commit them. Backups (Litestream to R2 plus daily age-encrypted snapshots) are described in `deploy/readfox/README.md`; the age private key is kept offline by the owner.
- **Database upgrades must be safe for two app versions on one database.** Production may later run a stable and a beta app on the same `lector.db`. Migrations run at startup in `api/src/db.ts` in every instance. Rules for a beta-safe migration:
  - Only add tables and columns.
  - Give every new column a `DEFAULT` or allow `NULL`. Old code that inserts rows must not fail.
  - Do not drop, rename or rebuild a table or index in a beta-safe change. Examples of rebuild migrations: `migrateCompositeTenantKeys`, `migrateAddLanguageColumn`.
  - Do a rebuild or drop on production only, when beta is stopped and traffic is low. Take a snapshot first with `/srv/lector/backup.sh`.
  - Each migration must be safe to run twice. Guard it with a column or table check.
- **Server firewall.** `/etc/nftables.conf` (table `gameguard`) drops everything except the ports it lists; new services need rules there as well as in `ufw`. Reloading the file with `flush ruleset` wipes Docker's rules, so add rules at runtime with `nft add rule` and mirror them in the file.
- **UI text is translated.** Never hard-code user-visible text: use `next-intl` (`useTranslations` / `getTranslations`) and add the key to `messages/src/en/<area>.json` and `messages/src/zh-CN/<area>.json` (same keys, same placeholders). Then run `node scripts/merge-messages.mjs` and commit the generated `messages/en.json` and `messages/zh-CN.json`. Conventions and the locale rules are in `docs/i18n-conventions.md` and `docs/i18n-plan.md`. `src/i18n/messages.test.ts` fails when catalogs drift. Three language settings are separate: `targetLanguage` (learning), `nativeLanguage` (translations and AI replies), and the interface locale (cookie `NEXT_LOCALE`). `/admin` stays English. Book titles, descriptions, review links and exam labels follow the interface locale when the translation language is one the interface offers (`displayLanguage` in `src/lib/display-language.ts`); other translation languages show as chosen.
- `readfox-todo.md` (one level above this repo, in `/Users/shawnhu/Dev/Lector/`) tracks open work.
- `docs/readfox-handoff.md` is a map of the Readfox-specific code, decisions and checks. Read it first when you start work here.

**Testing policy: CI runs the full e2e suite on every PR — rely on it for PR verification, and locally run the specs your change touches (plus `npm test` for unit tests).**

## Testing Requirements

Every new feature MUST be accompanied by:

- **Unit tests** covering the API/logic layer (if applicable)
- **E2E tests** (Playwright) covering:
  - The happy path (full user journey)
  - Edge cases (empty states, error handling, boundary conditions)

Tests live in:

- `src/**/*.test.ts` - vitest unit tests — run with `npm test`
- `api/src/**/*.test.ts` - bun:test unit tests — run with `cd api && bun test` (vitest excludes `api/**`; don't mix the two runners)
- `e2e/` - Playwright end-to-end tests — run with `npm run test:e2e` (boots both servers against an isolated `tmp/e2e-data`, never the real `data/`)

CI runs all of these, plus the e2e suite a second time against the production Docker image (`E2E_EXTERNAL_SERVER=1` with the container mapped to :3456 for the UI and :3457 for the Hono API the browser calls directly) to cover the standalone build and `docker-entrypoint.sh`. That e2e image is the amd64 image that a merge to master publishes. The workflow applies a new tag to it. It does not build it again.

A release tag is the one exception. `release.yml` builds the image again at the tag, because `git describe` must resolve to the tag for the About panel to report it. The release e2e job then runs against that rebuilt image, so the artifact that ships is the artifact that CI tested.

## API Documentation

`api/openapi.json` is generated from the route table, and it must stay complete.

- Mount a new route module in `api/src/routes/registry.ts`, never in `api/src/index.ts`.
- Add one entry per endpoint to `api/src/lib/openapi/annotations.ts`, keyed `"<METHOD> <path>"`.
- Run `npm run gen:openapi` and commit `api/openapi.json` with the change.

`bun test` in `api/` fails while a route has no entry, or while the committed
document is stale. The document holds only the endpoints a personal access token
can reach. The scope map in `api/src/lib/auth.ts` decides that set.

## Tech Stack

- Next.js 16 + React 19 — the front-end. It serves the UI only: no database, and **no `/api/*` routes** (the Next→Hono proxy was removed in #188).
- Hono on Bun is the API backend (`api/`), using Bun's native `bun:sqlite`. The browser talks to it **directly** — `src/lib/data-layer.ts` and the other client fetchers route every call through `apiFetch`/`apiUrl` from `src/lib/api-base.ts`, which reads the API origin from `window.__ENV__.API_URL`. That's injected at container start by `docker-entrypoint.sh` from the runtime `API_URL` env (written to `/__env.js`), since `NEXT_PUBLIC_*` bakes at build and can't be set on a prebuilt image; it falls back to `http://localhost:3457` for dev. The cross-origin calls rely on Hono's `app.use('*', cors())`. (better-sqlite3 survives only as a devDependency, for the `scripts/build-dictionary.ts` / `export-cached-entries.ts` tooling.)
- Tailwind CSS v4 (class-based dark mode via `@custom-variant`)
- shadcn/ui (Base UI primitives, `base-vega` style, zinc tokens) is initialized — add primitives with `npx shadcn@latest add <component>` into `src/components/ui/` and extend them there. Adoption is gradual: prefer `ui/` components in new/touched code, don't hand-roll buttons/dialogs/menus, and don't mass-migrate existing ones

## Flow maps

Maps of every app domain are in `docs/flows/`. Open `docs/flows/index.html` to walk the graph. The Lector node has a First walk. When you change a listed path, update `docs/flows/graph-data.js` and the matching `.md` notes. Then run `node docs/flows/validate-graph.mjs`.

## Key Patterns

- Pages use `NavHeader` component for sidebar/bottom nav
- Desktop sidebar is 56 units wide (`sm:ml-56` on page wrapper)
- Dark mode uses `.dark` class on `<html>`, toggled via `ThemeToggle`
- Practice page has type and MC modes with a fallback MC option

## SRS Behaviour (implemented in `src/app/practice/page.tsx`)

- Intervals: 0/1/3/7/14 days for mastery levels 0/25/50/75/100, scheduled at the exact review time (no midnight flooring). Mastery-100 cards keep a 14-day maintenance review and are served when due.
- Correct answers move up one level (+25). A miss hard-resets the card to mastery 0 and re-queues it at the end of the round; the retry runs from mastery 0 and awards no points (the answer was just shown).
- Cloze words from the bank can carry trailing punctuation — always strip via `splitTrailingPunctuation` (`src/lib/words.ts`) before matching, displaying, or persisting them.

## Dates, Streaks & Time Zone

- Day rollover (daily stats, streaks, review days) uses the `timezone` setting (Settings → Time Zone), falling back to the server's zone — never raw UTC. Server helper: `api/src/lib/dates.ts` (`getTodayDate()`); pure client-side math in `src/lib/dates.ts`.
- One streak definition app-wide: a day is active if it has any dictionary lookups, cloze practice, or reading minutes. Computed by `computeStreaks` (`src/lib/streak.ts`, mirrored in `api/src/lib/streak.ts`), served by `/api/stats/streak` (current + longest). Pages must not compute their own streaks.
- Pure helpers used on both sides (e.g. `dates`, `streak`, `stats-derive`) are mirrored between the client `src/lib/` copy and the Hono `api/src/lib/` copy — keep them in sync when editing. The Hono API owns the DB; the client copies are for rendering only.

# Repository instructions for coding agents

## Formatting

- `.editorconfig` and `.prettierrc` are the canonical shared formatting settings.
- Install dependencies from `package-lock.json`; the repository pins Prettier and its Tailwind plugin so every agent uses the same formatter implementation.
- Format only files changed for the current task: `npx prettier --write <touched-files...>`.
- Do not run repository-wide formatting during a feature or fix. The legacy tree is not yet fully normalized, so doing so creates unrelated review churn.
- Before handing off, run `npx prettier --check <touched-files...>` and `git diff --check`.
- A future formatting-only baseline change should normalize the whole tree before `npm run format:check` becomes a required CI gate.

## Code Comments

Write no comment by default. To test one, delete it. Then ask whether a competent reader can still get this code right. Keep the comment only when the answer is no. This test covers a doc comment as much as a `//` line.

- One comment states one fact, in two lines at most. A third line means the code needs a better name or a smaller function.
- A comment earns its place only when it records what the code cannot show:
  - a contract that a caller must honour
  - an invariant that ties two places together
  - a unit, or a magic value
  - a quirk in an external system, or in a data source
  - a mirrored file that must stay in step
- Do not editorialise. Cut every word that argues instead of informs. Cut capitals used for emphasis. `Deliberately not a loop` and `the whole point of` give a reader nothing to act on.
- Do not write the history of the change into the code. Put that in the commit message or the PR. A comment must not record:
  - how you reached the answer
  - what the code was before
  - which bug it closed
  - what a measurement showed
  - what a reviewer asked for
- An issue number is not a reason to add a comment. Add one only inside a comment that already earns its place.
- These rules beat local convention. Much of this tree is over-commented, so follow the rule and not the neighbours.
- Apply this to comments you write or change. Leave unrelated comments alone, for the reason `## Formatting` gives against repository-wide reformatting.

## GitHub text

- Always use an input file for multiline PR bodies and comments: `gh pr create/edit --body-file …` and `gh pr comment --body-file …`. Never embed escaped `\n` sequences in `--body`.

## Public README

`README.md` is the product page for GitHub and for self-hosters. Keep it current.

Update `README.md` in the same change when you:

- add or remove a feature that a user sees. This includes the reader, cloze, Anki, the tutor, import, and listen.
- add or remove a language pack, or change what a pack includes
- change deploy: image name, ports, Compose services, or a required env var
- change auth, `LECTOR_MODE`, backups, or the adopt-local-data flow

Do not put agent-only or contributor-only material in `README.md`. Put the folder styleguide, OpenAPI generation, and the local two-process setup in `CONTRIBUTING.md`. Put long operator notes in `deploy/README.md`.

Lead with Docker Compose. Do not lead with `npm run`. Do not describe Lector as an Afrikaans-only reader. Afrikaans is the first language pack, not the product.

After a README edit, run the STE linter on `README.md`, `CONTRIBUTING.md`, and `deploy/README.md`.
