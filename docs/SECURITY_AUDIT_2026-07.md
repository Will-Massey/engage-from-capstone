# Security Audit & SOC 2 Readiness — Engage by Capstone

**Date:** 2026-07-13 **Scope:** full application (backend, frontend, Cloudflare worker), integrations, and multi-tenant isolation. **Method:** four parallel code-verified audits (multi-tenancy, auth/session/RBAC, integrations/secrets/crypto, web/infra/data-protection) — every finding checked against source (`file:line`), no speculation.

---

## Executive summary

The security foundations are genuinely strong for a pre-launch SaaS: **multi-tenant isolation is airtight** (no cross-tenant IDOR found anywhere), cryptography is done correctly (AES-256-GCM with unique IVs, signature-verified webhooks, HMAC OAuth state, constant-time compares), and CI already runs gitleaks/CodeQL/Snyk/npm-audit.

The audit found **2 Critical auth flaws** that undermined the access-control model and a batch of High/Medium issues around evidential integrity, data protection, and web hardening. **All confirmed Critical and High code findings, and most Mediums, were remediated in this engagement** (PRs #64, #65). What remains is a short code backlog, one operational check (R2), and — the larger half — the **organizational controls SOC 2 requires that no code change delivers**.

**SOC 2 readiness after remediation: technical controls ~70–75% present; organizational program ~0% (not yet started).**

---

## Findings & status

| #   | Sev         | Finding                                                                                                                           | Status                                                                      |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C1  | 🔴 Critical | 2FA fully bypassable — `2fa_pending` token accepted as an access token                                                            | **Fixed #64**                                                               |
| C2  | 🔴 Critical | Privilege escalation — MANAGER can self-promote to ADMIN via `PUT /users/:id`                                                     | **Fixed #64**                                                               |
| H1  | 🟠 High     | MANAGER can mint an MD (full-access) via `POST /users`                                                                            | **Fixed #64**                                                               |
| H2  | 🟠 High     | `trust proxy` unset → shared-IP rate-limit collapse (login DoS) **and** wrong signer IP in e-sign/consent audit records           | **Fixed #64**                                                               |
| H3  | 🟠 High     | MANAGER can deactivate the tenant ADMIN                                                                                           | **Fixed #64**                                                               |
| H4  | 🟠 High     | E-sign audit trail destroyable (`onDelete: Cascade`, hard-deletable) & mutable                                                    | **Fixed #65**                                                               |
| H5  | 🟠 High     | GDPR erasure leaves Client PII + never deletes stored AML ID scans / signature files                                              | **Fixed #65**                                                               |
| H6  | 🟠 High     | Uploads on ephemeral disk if R2 not configured → AML docs/signatures lost per deploy                                              | **⚠️ Ops — verify `CLOUDFLARE_R2_*` in Render**                             |
| M1  | 🟡 Med      | Public SPA / sign page ships no security headers (clickjackable)                                                                  | **Fixed #65**                                                               |
| M2  | 🟡 Med      | Unauthenticated HTML-injection into staff notification email                                                                      | **Fixed #65**                                                               |
| M3  | 🟡 Med      | SSRF via tenant logo URL in PDF generation                                                                                        | **Fixed #65**                                                               |
| M4  | 🟡 Med      | Firm-group linking without target consent (metadata leak + cross-tenant write)                                                    | **Fixed #65**                                                               |
| M5  | 🟡 Med      | No log redaction — email/IP PII in logs                                                                                           | **Fixed #65**                                                               |
| M6  | 🟡 Med      | `ENCRYPTION_KEY` had no minimum-strength check                                                                                    | **Fixed #65**                                                               |
| M7  | 🟡 Med      | `.env.development` / `.env.production` tracked in git                                                                             | **Fixed #65**                                                               |
| M8  | 🟡 Med      | `morgan` log-forging advisory (GHSA-4vj7-5mj6-jm8m)                                                                               | **Fixed #65**                                                               |
| M9  | 🟡 Med      | CSP lacked `frame-ancestors`                                                                                                      | **Fixed #65**                                                               |
| M10 | 🟡 Med      | GDPR export silently truncated                                                                                                    | **Fixed #65**                                                               |
| B1  | 🟡 Med      | Access tokens non-revocable (24h; survive logout/password-reset)                                                                  | **Backlog**                                                                 |
| B2  | 🟡 Med      | 2FA backup codes low-entropy (32-bit, unsalted SHA-256)                                                                           | **Backlog**                                                                 |
| B3  | 🟡 Med      | No per-account throttle on 2FA verification                                                                                       | **Backlog**                                                                 |
| B4  | 🟡 Med      | CSRF middleware doesn't run for `/api/auth/*` (mount order); token not session-bound                                              | **Backlog** (mitigated by custom-header + CORS)                             |
| B5  | 🟡 Med      | No retention/purge job (post-erasure hard purge; HMRC 6-yr)                                                                       | **Backlog** (product/legal decision)                                        |
| B6  | 🟢 Low      | Login user-enumeration (message + timing)                                                                                         | **Backlog**                                                                 |
| B7  | 🟢 Low      | `extractTenant` still trusts `X-Tenant-Id` for selection (latent; no live exploit)                                                | **Backlog**                                                                 |
| B8  | 🟢 Low      | `POST /clients/:id/mtditsa-assessment` missing `authorize()` (not cross-tenant)                                                   | **Backlog**                                                                 |
| CQ  | —           | Triage the 17 open CodeQL alerts (real: log-injection, a QuickBooks SSRF flag; false-positive: `oauthState` HMAC "password-hash") | **Backlog** — dismiss FPs, fix reals; alert triage is itself SOC 2 evidence |

### Confirmed strong (bank these as SOC 2 evidence)

Multi-tenant isolation (JWT-derived `req.tenantId`, `X-Tenant-Id` spoof rejected, universal `tenantId` query scoping — **no IDOR found**); AES-256-GCM token encryption; every Stripe/AML webhook signature-verified on the raw body; HMAC OAuth state with expiry + constant-time verify; bcrypt-12 + refresh rotation + hashed single-use reset/verify tokens; `script-src 'self'` CSP; gated CORS (no wildcard+credentials); fail-closed env validation and DB migrations; graceful shutdown + pg advisory-lock job idempotency; no SQL injection; no mass-assignment; gitleaks/CodeQL/Snyk/npm-audit in CI.

---

## SOC 2 readiness map (5 Trust Service Criteria)

SOC 2 is roughly **half engineering, half organizational process**. Even with every code fix above, an auditor requires documented, _operating_ controls observed over a period (Type II = 3–12 months; Type I = point-in-time).

| Criterion                     | Code state (post-fix)                                                                 | Organizational gap (not code)                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security (CC)**             | Good — access control, auth, encryption, headers, CSRF, secret mgmt in place          | Access-control & security policies; quarterly access reviews; change-management approval records; secrets-rotation policy; **penetration test** |
| **Availability (A)**          | Good — graceful shutdown, job locks, health checks, Neon PITR, fail-closed migrations | Backup _restore_ testing evidence; RTO/RPO targets; uptime monitoring + **alerting**; DR runbook; on-call/incident response                     |
| **Processing Integrity (PI)** | Improved — immutable e-sign trail, correct signer IP, zod validation                  | Documented QA/data-processing controls; e-sign legal-validity attestation; reconciliation procedures                                            |
| **Confidentiality (C)**       | Good — encryption at rest, log redaction, gated file access                           | Data-classification policy; key-management/rotation program; log-retention policy; **sub-processor DPAs** (Render/Neon/Cloudflare/Stripe/xAI)   |
| **Privacy (P)**               | Improved — anonymize-retain erasure, client-scoped erasure, AML-file deletion         | Privacy notice; RoPA (GDPR Art 30); DPIA for AML/e-sign; DSAR workflow + SLA; breach-notification procedure; consent records                    |

### The organizational program you still need (no code delivers this)

1. **Policies** — security, access control, data classification, retention, incident response, change management, vendor management, acceptable use, BCP/DR.
2. **Operating controls** — quarterly access reviews, onboarding/offboarding checklists, background checks, security-awareness training, documented change approvals.
3. **Monitoring** — Sentry (set `SENTRY_DSN`), uptime + alerting, log aggregation/retention, the CodeQL/Snyk triage workflow.
4. **Vendor management** — sign DPAs with every sub-processor; keep a sub-processor register.
5. **Testing** — an external **penetration test** and remediation evidence.
6. **The audit** — engage a CPA firm, run a compliance platform (Vanta / Drata / Secureframe) to automate evidence collection, then observe controls over the audit window.

**Realistic path:** Type I in ~2–3 months once policies + monitoring are in place; Type II is that plus a 6–12 month observation window. Budget a compliance platform and auditor fees, not just engineering time.

---

## Remediation shipped this engagement

- **PR #64** — Criticals: 2FA bypass, privilege-escalation (role hierarchy), trust-proxy. + regression tests.
- **PR #65** — Hardening: e-sign immutability, GDPR erasure completeness, SPA security headers, email escaping, SSRF guard, firm-group consent, encryption-key check, log redaction, `.env` untracking, morgan bump. + tests.

## Immediate next actions (you)

1. **Verify `CLOUDFLARE_R2_*` is set in Render** (H6) — else uploads are being lost now.
2. Set `SENTRY_DSN` (monitoring gap).
3. Rotate any dev secrets that were ever real in git history.
4. Triage the 17 CodeQL alerts (dismiss FPs, fix real log-injection).
5. Decide on the retention policy (B5) so the purge job can be built.
6. Stand up the SOC 2 program (policies + a compliance platform) — the long pole.
