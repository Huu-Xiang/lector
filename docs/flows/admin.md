# Admin domain

Admin is the operator dashboard. It exists in cloud mode only. `requireAdmin` gates every `/api/admin` route.

## Admin member list

**App domain:** Admin

The admin page loads a summary and a member list.

| Role | Path | Function |
| --- | --- | --- |
| Page | `src/app/admin/page.tsx` | Admin page |
| Client | `src/lib/admin-client.ts` | `getAdminSummary`, `getAdminUsers`, `getAuditLog` |
| API | `api/src/routes/admin.ts` | `GET /summary`, `GET /users`, `GET /audit` |
| Gate | `api/src/lib/admin.ts` | `makeRequireAdmin`, `isAdmin` |

`LECTOR_ADMIN_EMAILS` is the allow list. A non-admin gets 403.

Each row shows plan, status, last active, library size, and month usage.

## Admin trends

**App domain:** Admin

The Trends section shows daily totals for 7, 30 or 90 days.

| Role | Path | Function |
| --- | --- | --- |
| Page | `src/app/admin/Trends.tsx` | Trends section |
| Client | `src/lib/admin-client.ts` | `getAdminTrends` |
| API | `api/src/routes/admin.ts` | `GET /trends?days=7\|30\|90` |
| Logic | `api/src/lib/admin-trends.ts` | `buildAdminTrends` |

It counts only totals. Admin and billing-exempt accounts are left out.

- Active learners and lookups come from `dailyStats`, which uses each learner's time zone.
- Signups, Free AI translations (`usage_counters`) and RMB orders (`cn_orders`) use UTC days.
- Paid AI calls are counted per month only, so the chart leaves them out.

## Admin support action

**App domain:** Admin

Each support write hits the audit log.

```mermaid
flowchart TD
  Page[Admin page] --> Client[admin-client.ts]
  Client --> Route["POST /api/admin/users/:id/..."]
  Route --> Gate[requireAdmin]
  Gate --> Flag[admin_account_flags]
  Gate --> Audit[admin_audit_log]
```

| Action | Client | Route |
| --- | --- | --- |
| Suspend | `suspendUser` | `POST /users/:id/suspend` |
| Restore | `restoreUser` | `POST /users/:id/restore` |
| Comp | `compUser` | `POST /users/:id/comp` |
| Uncomp | `uncompUser` | `POST /users/:id/uncomp` |
| Export | `exportUser` | `GET /users/:id/export` |
| Reset MFA | `resetMfa` | `POST /users/:id/reset-mfa` |
| Password reset | `sendPasswordReset` | `POST /users/:id/password-reset` |
| Resend confirmation | `resendVerification` | `POST /users/:id/resend-verification` |
| Force confirmation | `forceVerify` | `POST /users/:id/verify` |
| Revoke sessions | `revokeSessions` | `POST /users/:id/revoke-sessions` |
| Resync Paddle | `resyncPaddle` | `POST /users/:id/resync-paddle` |

Export uses `buildUserExport`. See [Data](data.md).

Comp writes a flag. It does not create a Paddle row. The entitlements engine treats the flag as a paid plan.

### Tables

`admin_account_flags`, `admin_audit_log`. The unused `admin_impersonation` table stays in the schema.
