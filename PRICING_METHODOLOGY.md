# Phase W2.9 — Pricing Methodology Module

Value-based pricing calculator for UK accountants. **Rule engine only** — Clara is optional and only invoked when the user clicks **Explain pricing** (single short paragraph, ~120 tokens max).

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pricing/suggest-fees` | Rule-based fee suggestions (authenticated) |
| `POST` | `/api/pricing/explain` | Optional Clara explanation (authenticated, AI budget check) |

## Frontend

| Path | Description |
|------|-------------|
| `/pricing-calculator` | Full-page calculator |
| `/services` | Embedded compact calculator section |

**Apply to proposal** saves suggestions to `sessionStorage` (`engage-pricing-suggestion`) and navigates to `/proposals/new?manual=1&fromPricing=1`. The proposal builder matches catalogue services by `serviceTemplateId` or name and pre-fills line prices.

---

## Inputs

| Field | Values |
|-------|--------|
| `turnoverBand` | `UNDER_50K`, `BAND_50K_100K`, `BAND_100K_250K`, `BAND_250K_500K`, `BAND_500K_1M`, `OVER_1M` |
| `entityType` | `LIMITED_COMPANY`, `SOLE_TRADER`, `LLP`, `PARTNERSHIP` |
| `employeeCount` | 0–500 |
| `vatRegistered` | boolean |
| `mtdStatus` | `NOT_APPLICABLE`, `NOT_REGISTERED`, `REGISTERED`, `FULLY_COMPLIANT` |
| `complexity.hasPayroll` | boolean |
| `complexity.hasRd` | boolean |
| `complexity.multiSite` | boolean |

---

## Formula

### 1. Service selection (rules, not LLM)

**Core packages by entity**

| Entity | Catalogue services |
|--------|-------------------|
| Limited company | Statutory Annual Accounts, CT600 Corporation Tax Return, Confirmation Statement (CS01) |
| LLP | Statutory Annual Accounts |
| Sole trader | Sole Trader Annual Accounts, Personal Tax Return (SA100) |
| Partnership | Personal Tax Return (SA100) |

**Conditional add-ons**

| Condition | Service added |
|-----------|---------------|
| `vatRegistered` | VAT Return Preparation |
| `hasPayroll` or `employeeCount > 0` | Monthly Payroll Processing |
| `hasRd` (Ltd only) | R&D Tax Credit Claim |
| `multiSite` or turnover ≥ £500k | Full Bookkeeping Service |
| Sole trader + `NOT_REGISTERED` | MTD Digital Setup & Training |
| Sole trader + `REGISTERED` / `FULLY_COMPLIANT` | MTD ITSA Quarterly Return |

All selections are filtered by `applicableEntityTypes` on the catalogue entry.

### 2. Baseline fee

```
baseline = tenant.priceAmount ?? catalogue.basePrice
```

Tenant catalogue prices override UK seed baselines when a name match exists.

### 3. Catalogue complexity factors

From `ukAccountancyServices.ts` `complexityFactors[]`, evaluated against a synthetic context:

| Context field | Source |
|---------------|--------|
| `turnover` | Band midpoint (£25k … £1.5m) |
| `employeeCount` | Input |
| `hasRAndD` | `complexity.hasRd` |
| `transactionCount` | 200 / 400 / 600 by turnover band |

Adjustments applied in order:

- `PERCENTAGE`: `price × (1 + value/100)`
- `MULTIPLIER`: `price × value`
- `FIXED`: `price + value`

**Payroll special case:** `£25 + £8 × max(0, employeeCount − 1)` per month (catalogue per-employee rule).

### 4. Global multipliers

**Turnover band** (compliance + bookkeeping only):

| Band | Multiplier |
|------|------------|
| Under £50k | 0.85 |
| £50k – £99,999 | 0.92 |
| £100k – £249,999 | 1.00 |
| £250k – £499,999 | 1.15 |
| £500k – £999,999 | 1.30 |
| £1m+ | 1.50 |

**Entity type** (all services):

| Entity | Multiplier |
|--------|------------|
| Limited company | 1.00 |
| Sole trader | 0.95 |
| LLP | 1.05 |
| Partnership | 0.98 |

**Multi-site:** `× 1.15` on all adjusted fees.

### 5. Suggested fee band

```
suggestedPrice = round(price after all adjustments)
feeLow       = round(suggestedPrice × 0.90)
feeHigh      = round(suggestedPrice × 1.10)
```

### 6. Totals

Monthly totals normalise quarterly/annual lines to monthly equivalents for comparison. Annual total sums each line’s `annualEquivalent`.

---

## Example: £250k Ltd with payroll

**Inputs**

```json
{
  "turnoverBand": "BAND_250K_500K",
  "entityType": "LIMITED_COMPANY",
  "employeeCount": 5,
  "vatRegistered": true,
  "mtdStatus": "NOT_APPLICABLE",
  "complexity": { "hasPayroll": true, "hasRd": false, "multiSite": false }
}
```

**Suggested fees (ex-VAT, monthly display prices)**

| Service | Baseline | Calculation | Suggested | Band |
|---------|----------|-------------|-----------|------|
| Statutory Annual Accounts | £63/mo | £63 × 1.15 turnover | **£72** | £65 – £79 |
| CT600 Corporation Tax Return | £50/mo | £50 × 1.15 | **£58** | £52 – £64 |
| Confirmation Statement (CS01) | £13/mo | £13 × 1.15 | **£15** | £14 – £17 |
| VAT Return Preparation | £67/mo | £67 × 1.15 | **£77** | £69 – £85 |
| Monthly Payroll Processing | £25/mo | £25 + 4×£8 employees | **£57** | £51 – £63 |

**Totals (approx.)**

- Monthly midpoint: **~£279**
- Monthly band: **~£251 – £308**
- Annual suggested: **~£3,329** (compliance annualised; payroll £57×12)

---

## Files changed

| File | Change |
|------|--------|
| `backend/src/services/pricingMethodology.ts` | Rule engine |
| `backend/src/routes/pricing.ts` | API routes |
| `backend/src/index.ts` | Mount `/api/pricing` |
| `backend/src/services/__tests__/pricingMethodology.test.ts` | Unit tests |
| `frontend/src/components/pricing/PricingCalculator.tsx` | Calculator UI |
| `frontend/src/pages/pricing/PricingCalculatorPage.tsx` | Full page |
| `frontend/src/pages/services/Services.tsx` | Embedded section |
| `frontend/src/utils/pricingSuggestionStorage.ts` | Proposal handoff |
| `frontend/src/utils/api.ts` | API client methods |
| `frontend/src/components/proposals/ProposalBuilder.tsx` | Apply from calculator |
| `frontend/src/App.tsx` | Route |
| `frontend/src/config/navigation.ts` | Nav + breadcrumbs |
| `PRICING_METHODOLOGY.md` | This document |

---

## Implementation notes

- No LLM in `/suggest-fees` — deterministic and cacheable.
- Clara `/explain` checks AI token budget before one cheap completion.
- Unmatched catalogue names are flagged in UI; user can import UK templates via Services → seed/import flows.
- Feeds **W4.1** anonymised fee benchmarks (future).