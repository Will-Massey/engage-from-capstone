# Float → Int-pence money migration (P3) — design

**Status: COMPLETE.** Stage 1 shipped 2026-07-10 (PR #50, migration
`20260710130000_money_int_pence_stage1`). Stage 2 shipped 2026-07-17
(migration `20260717150000_money_int_pence_stage2_drop_float`): pence columns
are `NOT NULL` and authoritative, the Float columns are dropped, every read
converts at the API boundary via `penceToPounds`, and the wire format stays
pounds (frontend untouched). Prod was verified drift-free (30 proposals / 72
service lines, zero NULL pence, zero pence-vs-float drift) and both tables
were snapshotted to JSON before the drop. The signing `documentHash` now
hashes the pence snapshot — stamped at sign time only, never recomputed, so
historical signature hashes are unaffected.

## Problem

Money is stored as Postgres `double precision` (Prisma `Float`) in the proposal
domain, while the payments domain already uses integer pence
(`PaymentSplit.totalPence` etc.). Float money accumulates representation error
(`0.1 + 0.2 !== 0.3`), risks penny drift between displayed totals and charged
amounts, and makes equality checks unreliable. The P0 money-invariant tests
pin `gross = net + vat` today, but the storage type still permits drift.

## Columns in scope (all currently Float)

| Model             | Fields → pence                                                              | Stays as-is (not money)            |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `Proposal`        | subtotal, discountAmount, vatAmount, total, discountValue\*                 | vatRate                            |
| `ProposalService` | displayPrice, unitPrice, lineTotal, vatAmount, grossTotal, annualEquivalent | quantity, discountPercent, vatRate |
| `ServiceTemplate` | priceAmount, basePrice, annualEquivalent                                    | baseHours                          |
| `PricingRule`     | — (adjustmentValue can be a percentage; excluded)                           | adjustmentValue                    |

\*`discountValue` is a percentage when `discountType=PERCENT` — needs a data
audit before conversion; may follow adjustmentValue out of scope.

## Approach: staged, boundary-converted

Follow the payments convention: **new `*Pence Int` column names** (e.g.
`lineTotalPence`), not in-place type changes. Renaming forces every one of the
~530 references through the compiler — no silent pounds/pence confusion.

### Stage 1 — storage + backend (one PR, one deploy)

1. Schema: add `*Pence Int` columns alongside the Float ones.
2. Migration SQL: backfill `pence = ROUND(pounds * 100)` (single statement per
   table, inside the migration transaction). Keep old columns for one release
   as a rollback path (they go stale after cutover writes begin).
3. Backend cutover: `proposalPricing.buildProposalServiceRecord` /
   `calculateHeaderTotals` emit pence; all Prisma reads/writes use the pence
   columns. **Wire format stays pounds**: a single serializer at the API
   boundary (`penceToPounds` on the proposal/service DTO mappers) so the
   frontend is completely unaffected by Stage 1.
4. The shared engine keeps operating in pounds for UI math; `roundMoney`
   guarantees 2dp at every boundary. Pence conversion happens exactly once at
   persistence (`Math.round(x * 100)`) and once at read (`/100`).
5. Money-invariant tests extended: pence columns are integers; pounds↔pence
   round-trips are lossless for 2dp values; header pence = Σ line pence.

### Stage 2 — cleanup (separate PR, after Stage 1 soaks)

- Drop the Float columns.
- Optionally move the wire format to pence (frontend change) — evaluate then.

### Deploy safety

- Pre-deploy Neon backup branch already automated in CI.
- Migration runs at boot via `start-prod.mjs` (fail-closed).
- Backfill is idempotent (`WHERE "lineTotalPence" IS NULL` guard) in case of
  boot retry.
- Rollback: redeploy previous image — old code reads the untouched Float
  columns. (Writes made after cutover would need the backup branch.)

## Open questions for review

1. `discountValue` semantics audit (percent vs absolute) — needs a prod data query.
2. `ServiceTemplate.annualEquivalent` is derived — recompute instead of backfill?
3. Should e2e get a dedicated migration-verification spec (create proposal
   pre-migration fixture → assert totals unchanged post-migration)?
