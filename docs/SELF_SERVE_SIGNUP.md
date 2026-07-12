# Self-serve public signup

Public tenant signup (`POST /api/tenants`, the `/register` wizard) is gated in
production behind email verification and an env flag.

## The flag

`ALLOW_PUBLIC_TENANT_SIGNUP` — declared in `render.yaml` with `sync: false`.
Set it to `true` in the Render dashboard to open signup; unset/anything else
returns `403 SIGNUP_DISABLED`. Outside production (`NODE_ENV !== 'production'`)
signup is always allowed. The legacy `POST /api/auth/register` has the same
mechanism via `ALLOW_PUBLIC_REGISTER`.

## The flow

1. `POST /api/tenants` creates the tenant + PARTNER admin with
   `User.emailVerified = NULL` and **does not issue a session** (no cookies).
   Response: `201 { success: true, data: { requiresVerification: true, email } }`.
2. A verification email ("Verify your email — Engage by Capstone") is sent via
   the tenant mailer with a link to `${FRONTEND_URL}/verify-email?token=…`.
   Tokens are 32 random bytes, stored as a sha256 hash in `EmailVerification`
   (mirrors `PasswordReset`), single-use, **24-hour TTL**, one outstanding
   token per user.
3. `POST /api/auth/verify-email { token }` sets `emailVerified` and consumes
   the token. Invalid/expired/reused tokens get a generic `400 INVALID_TOKEN`.
4. Login (`POST /api/auth/login`) returns
   `200 { success: true, data: { requiresVerification: true, email } }` for
   unverified users — no session, no `lastLoginAt` — mirroring the
   `requires2FA` step. The frontend shows a resend panel.
   Login also falls back to an email-only user lookup when the request didn't
   pin a tenant explicitly and the ambient tenant (host subdomain /
   `DEFAULT_TENANT_SUBDOMAIN`) has no matching user — without this, a freshly
   signed-up practice could never sign in from the apex domain because every
   login was scoped to the `demo` default tenant.
5. `POST /api/auth/resend-verification { email, subdomain? }` always answers
   neutrally (anti-enumeration, same posture as `forgot-password`) and only
   actually sends when the user exists, is active, and is still unverified.

## Who starts unverified

Only the two public registration paths (tenant signup admin and legacy
`/api/auth/register`). Admin-created staff (`POST /api/auth/users`), the ops
setup route, and all seed scripts set `emailVerified` at creation — an admin
vouches for those addresses.

## Backfill semantics

The `20260712100000_email_verification` migration ends with:

```sql
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "emailVerified" IS NULL;
```

Every user that exists at deploy time (all of prod, all seeded environments)
is grandfathered as verified, so this deploy can never lock anyone out.

## Rate / resend limits

`/api/auth/verify-email` and `/api/auth/resend-verification` sit behind the
shared `authLimiter` (40 requests / 15 min / IP); tenant signup itself is
limited to 5/hour/IP. Resending always replaces the outstanding token
(delete-then-create), so only the newest link works.

## E2E backdoor

`POST /api/auth/e2e/verification-token { email }` returns a fresh token for
Playwright (`signup-verification.spec.ts`). It is gated by
`isE2eTestRequest`: the `X-Test-Mode` header outside production, and in
production additionally requires `X-Test-Mode-Secret` to match
`E2E_BYPASS_SECRET` — if that env var is unset (it is not in `render.yaml`),
the route can never activate.
