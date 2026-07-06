# Engage Roadmap Verification & Smoke Checklist (Post 2026-06-30 Push)

## Just Completed (all "suggested" items actioned via main + 4 spawned subagents)

- ✅ Backend cheap extensions: /revise-services, generalized /suggest-title, richer /analyze-email (issues + missing + score), voice cheap path hardened.
- ✅ Email dialog: subject chips now "apply + re-analyze", full CTA list + insert/replace buttons, prominent "Clara email analysis" checklist with per-issue "Fix this with Clara", auto re-analyze (debounced), green "accepted version" badge on body.
- ✅ Empty states + AI meter: new cheap /ai/empty-suggestion, live Clara tips on Clients / Proposals / Services lists (with cache + fallback), full "Clara & AI" budget meter (used/remaining/calls + progress bar) in Settings > Appearance.
- ✅ Voice: functional cheap flow + "🎤 Voice with Clara" button in ProposalBuilder (prompt for transcript → title/services/cover prefill).
- ✅ Webhook stub: POST /api/ai/webhooks/email resilient logger + activity.
- ✅ Typecheck: full clean across backend/frontend/shared.
- ✅ Low token throughout, UK English, glass/dark preserved.

## Smoke / Verify on Render (after deploy)

1. Login → open/create proposal with client.
2. Clara email preview:
   - Streams live.
   - Quick tweaks (Warmer etc) + custom → body updates, approved cleared, auto subject re-suggest + analysis re-run.
   - Subject chips: click one → applies + re-analyzes (toast).
   - CTA suggest: shows list, "Insert this CTA" or "replace last".
   - Analysis section: shows issues (or "No issues"), "Fix this with Clara" buttons work.
   - Approve + Send uses the final tweaked subject/body.
3. Cover letter in builder: streaming + revise buttons.
4. Services/Pricing: use /revise-services via future UI or direct (test endpoint).
5. Voice: click 🎤 Voice with Clara, paste sample transcript → title + services + cover letter prefilled.
6. Empty states (new client / no proposals / services): shows live "Clara suggests..." tip (different per list).
7. Settings > Appearance: "Clara & AI" meter shows real tokenBudget numbers + progress.
8. Theme: toggle light/dark, all new sections (analysis amber card, meter, voice button, tips) have excellent contrast.
9. Profile phone/jobTitle still persist (regression).
10. No "X X" name dups.

## Manual Ops

- [ ] Upgrade backend on Render dashboard to Starter + ensure 10GB disk mounted at /var/data.
- [ ] Check deploy logs for the new routes (/revise-services, /empty-suggestion, /webhooks/email).
- [ ] Optional: hit /api/ai/status and confirm tokenBudget + features include the new ones.

## Next (carry over)

- Dashboard Clara attention / empty tips.
- Real mic voice (Web Speech or Cloudflare).
- Full E2E coverage for new flows (agent started additions).
- Webhook signature validation + real EmailLog updates.
- Render custom domain + Starter disk.

Run full smoke after each deploy. All changes pushed trigger auto Render build.

Last updated: 2026-06-30 (subagent swarm + main)
