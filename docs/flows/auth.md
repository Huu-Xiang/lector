# Auth domain

Auth is the cloud session gate. Selfhost skips this domain. The root layout mounts AuthGuard first.

## Sign in

**App domain:** Auth

```mermaid
sequenceDiagram
  actor User
  participant Guard as AuthGuard
  participant Login as Login page
  participant Auth as authClient
  participant API as Better Auth
  participant DB as session table

  User->>Guard: Open an app route
  Guard->>Auth: useSession
  alt No session
    Guard->>Login: bounceToLogin
  end
  User->>Login: Email and password
  Login->>Auth: signIn.email
  Auth->>API: POST /api/auth/sign-in/email
  API->>DB: Write session cookie
  Login->>Guard: Session exists
```

### Key files

| Role | Path | Function |
| --- | --- | --- |
| Gate | `src/components/AuthGuard/index.tsx` | `AuthGuard`, `CloudSessionGate` |
| Login | `src/app/(auth)/login/page.tsx` | `handleSubmit` |
| Client | `src/lib/auth-client.ts` | `authClient` |
| Bounce | `src/lib/api-base.ts` | `bounceToLogin` |
| Engine | `api/src/lib/accounts.ts` | `createAuthEngine`, `getAuthEngine` |
| Mount | `api/src/index.ts` | `/api/auth/*` |

### Branches

- Selfhost never mounts `useSession`. The API has no `/api/auth/*` route.
- Auth pages render even with no session. They send a signed-in user to `/`.
- When `window.__ENV__` enables them, GitHub and OIDC buttons show on `/login`. The OIDC button also shows on `/register`.
- A Google login (`OIDC_ISSUER=https://accounts.google.com`) joins the account with the same email. If that account never verified its email, the API deletes its password and sessions first (`dropUnverifiedPassword`).
- A new provider account counts as verified. It gets the welcome plan, the welcome mail and one anonymous `signup` count. Invite-only mode applies to it.
- The alias rule (Gmail dots, `+tag`) blocks an email sign-up when any account holds an alias of the address. A provider sign-up is blocked only by a verified account (`signupEmailProblem`, `verifiedOnly`), so an unverified alias cannot lock out the real mailbox owner.
- The welcome offer (`WELCOME_CODE`) is given once per mailbox. A successful claim stores `sha256` hashes of the canonical email (Gmail dots and `+tag` folded) and of its domain in `welcome_claims` (`lib/welcome-claims.ts`). The table has no user id and survives account deletion. A mailbox with a stored hash gets no offer. A private domain with 3 claims in the last 30 days gets none. Big public providers (`PUBLIC_MAIL_DOMAINS`) have no domain limit. A refusal is logged with the user id, the account stays free, and verification still succeeds. `runAuthMigrations` backfills hashes for accounts that already redeemed the welcome code.
- The welcome mail starts after the plan step and the callback does not wait for it. A mail error is logged and sent to Sentry.
- A cancelled or refused provider login returns to `/login?error=<code>`. The page shows a message for the code.
- Turnstile is a one-use token. A failed submit remounts the widget.
- An unverified email stays on the login page. The user can ask for a new mail.

### Tables

Better Auth owns `user`, `session`, `account`, and `verification`. Lector study tables do not hold the session.

### Tests

`e2e/auth-cloud.spec.ts`, `e2e/auth-selfhost.spec.ts`.

## Sign up

**App domain:** Auth

The register page calls `authClient.signUp.email`. Better Auth sends a confirmation email. The account is not a session until the user opens the confirmation link.

| Role | Path | Function |
| --- | --- | --- |
| Register | `src/app/(auth)/register/page.tsx` | `handleSubmit` |
| Engine | `api/src/lib/accounts.ts` | `createAuthEngine` |

Reset password and two-factor live in `src/app/(auth)/reset-password/` and `src/app/(auth)/two-factor/`. They use the same Better Auth handler.

## Lifecycle email

**App domain:** Auth

Cloud sends each Resend template once. Self-host does not send these templates.

| Role | Path | Function |
| --- | --- | --- |
| Hook | `api/src/lib/accounts.ts` | `afterEmailVerification` |
| Rules | `api/src/lib/lifecycle-email.ts` | `sendWelcomeEmail`, `sweepLifecycleEmails` |
| Transport | `api/src/lib/email.ts` | `sendEmail` |
| Log | `api/src/db.ts` | `email_sends` |

### Send rules

- Welcome: the user confirms email. An OAuth user with a confirmed email gets this email on create. The sweep does not send welcome. If `RESEND_API_KEY` is absent when the user confirms, the send does not run. That send does not retry.
- Day 1: the account age is 24 hours to 72 hours. The user has no saved word.
- Day 3: the account age is 72 hours to 7 days. The user has no real use.
- The sweep skips an account older than 7 days. The sweep does not send welcome, Anki, or gloss-cap.
- Anki: the user has 10 saved words. Ignored words do not count.
- Gloss cap: a free-plan user reaches the monthly gloss limit.
- Plan ending: a user's latest paid grant (`plan_grants`) ends in the next 72 hours. The user has no Paddle subscription and no comp. One mail per grant. The end date uses the user's stored `timezone`, or the server zone when none is stored.
- Review due: the user has 5 or more words to review (the count of the review page), no review or lookup today, and activity in the last 30 days. The last mail is 3 or more days old, and fewer than 3 mails went unanswered. The mail goes out from 17:00 in the user's stored `timezone`. A user with no valid stored zone gets none. One sweep sends at most 200 review-due mails and gives the event loop a turn every 25 users.

Real use is a saved word, a learner event, or progress on a lesson above zero. A starter lesson with `lastReadAt` is not real use.

### Skip rules

The send does not run when:

- The app is not cloud.
- `RESEND_API_KEY` is absent.
- The user did not confirm the email.
- The user already has that template.
- The user asked to stop product emails.
- The account is suspended (`admin_account_flags.suspended`).
- The product email switch is off. See [Admin](admin.md#product-email-switch).

The sweep runs every 15 minutes. Each loop (new accounts, plan ending, review due) and each user fails on its own. A failed send frees its send row. The same template is not tried again for the same user inside 6 hours (kept in memory, so a restart allows one early retry).

If `EMAIL_UNSUB_SECRET` is set, stop-mail tokens use that secret. If it is absent, the tokens use `BETTER_AUTH_SECRET`. A check accepts both secrets.

The app sends `verify`, `reset`, and `delete` mails as plain text. A transport error does not fail signup or login. The Resend call stops after 15 seconds.

`api/src/lib/lifecycle-email.test.ts` and `api/src/lib/email.test.ts` cover the rules.

## Session gate

**App domain:** Auth

The root layout order is AuthGuard, then BillingGuard, then SetupGuard.

```mermaid
flowchart TD
  Layout[src/app/layout.tsx] --> Auth[AuthGuard]
  Auth --> Billing[BillingGuard]
  Billing --> Setup[SetupGuard]
  Setup --> App[App pages]
```

- Cloud: AuthGuard waits for a session. BillingGuard waits for `accessAllowed`. SetupGuard waits for `targetLanguage`.
- Selfhost: AuthGuard and BillingGuard pass through. SetupGuard still runs.
- `apiFetch` treats 401 as `bounceToLogin` and 402 as `bounceToSubscribe`.
- Public pages (`AUTH_ROUTES`) render at once, also during server rendering, so their text is in the HTML.
- SetupGuard mounts `TabPreloader` once the language is known, so other tabs preload in the right language after the gates pass.
- Sign-out goes through `signOutAndForget` (`src/lib/sign-out.ts`), which removes remembered pages first. The login page removes them again when the server says there is no session; a failed session check does not remove them.
