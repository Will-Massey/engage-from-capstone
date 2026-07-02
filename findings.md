# Findings — Market Leader Initiative
<!-- Updated 2026-07-01 -->

## Competitive research summary

### Direct UK competitors
- **GoProposal (Sage):** £70–225/mo; OverSuite auto-updating letters; AML add-on; Xero; pricing methodology
- **FigsFlow:** £24–120/mo; 100+ templates; pricing calculator; AML £3/check; Xero/QBO/HubSpot/GoCardless/Zapier
- **Ignition:** proposal→payment→recurring billing; AI price insights; 8500+ customers; Xero/QBO/Karbon

### Engage advantages
- Clara AI depth (30+ endpoints, streaming, CH brief, MTD ITSA)
- Engagement clause library + AI assembly
- Touchpoint lifecycle engine
- Competitive SaaS pricing (£49–249)

### Critical gaps
- No live accounting integrations (Xero/QBO roadmap only)
- Post-sign payment loop incomplete vs Ignition
- AML is form stub not product
- AI budget uses estimated tokens (calls × 2.5k)
- MFA/password reset return 501
- Benchmark/regulatory AI endpoints are stubs

## Template library seeding (2026-07-02)
- **Root cause:** Tenants with only a custom template never had the Engage ICAEW/ACCA library seeded — `GET /api/proposal-templates` now calls `ensureProposalTemplateLibraryForTenant` when `libraryCount < expected`.
- **Additive:** `seedProposalTemplatesForTenant` skips existing names; `isDefault: true` = library, `false` = custom; library rows cannot be deleted.
- **Backfill (2026-07-02):** Demo tenant had 143 templates but `isDefault: false` on all (seeded before library flag). GET now runs `backfillLibraryTemplateFlagsForTenant` to promote rows matching package names; custom names stay `isDefault: false`.
- **Touchpoints:** `DEFAULT_TOUCHPOINT_TEMPLATES` in `backend/src/data/defaultTouchpointTemplates.ts`; `ensureTouchpointTemplatesForTenant` on GET; restore per-stage via `POST /touchpoints/templates/:stage/restore-default`.

## Technical anchors (codebase)
- AI: `backend/src/routes/ai.ts`, `backend/src/services/ai/aiClient.ts`
- Builder: `frontend/src/components/proposals/ProposalBuilder.tsx`
- Auth 501: `backend/src/routes/auth.ts`
- Clause library: `backend/src/data/engagementClauseLibrary.ts`
- Revolut: `backend/src/lib/revolut/`, `backend/src/routes/billing.ts`
- Renewals: `backend/src/jobs/renewalReminders.ts`

## Agent execution log
| Agent | Phase | Result |
|-------|-------|--------|
| ai-cost-agent | W2.1–W2.6 | ✅ Auto-fit user-triggered; template-first letters; clause assembly; 24h brief cache; real token logging; stub flags hidden |
| wizard-agent | W2.7–W2.8 | ✅ FirstProposalWizard 5-step; ClaraServiceSuggestionCards Accept/Tweak/Reject |
| security-agent | W0.1–W0.2 | ✅ MFA/TOTP + password reset (4 migrations) |
| compliance-agent | W3.1 | ✅ EngagementLibraryVersion + Settings publish UI |
| renewals-agent | W1.5 | ✅ BulkRenewalWizard + bulk-renewal API |
| xero-agent | W1.1–W1.2 | ✅ OAuth scaffold; import clients; push notes (invoice stub) |
| pricing-agent | W2.9 | ✅ Rule-engine calculator + PRICING_METHODOLOGY.md |
| analytics-agent | W3.6 | ✅ Decline reasons + win-loss analytics |
| payments-agent | W1.3–W1.4 | ✅ Post-sign Revolut/GoCardless stub + staff status panel |

**Still pending:** W0.3–W0.6, W1.6 partner approval, W2.10 preview pane, W3.2–W3.5, entire W4.