# Engage World Domination Plan — Exceed Engager on Every Metric

**Date:** 2026-08-02  
**Scope:** Capstone **Engage Practice** → cutover → category leadership  
**North star:** *Companies House → priced UK proposal → signed engagement → collected fees → jobs delivered → renewals* — with **Engager-class ops**, **metallic Capstone craft**, and **Clara as the co-pilot Engager cannot match**.  
**Baseline scores:** `docs/ENGAGE_VS_ENGAGER_SCORECARD_2026-08-02.md` (Engage ~7.1 vs Engager ~7.8)  
**Target scores:** **≥9.0 on every equal-weight dimension** within 4 waves; overall **≥9.2**  
**Engage × AccountFlow mesh:** `docs/ENGAGE_ACCOUNTFLOW_UNIFIED_PLATFORM_PLAN.md` (federated shell → optional monorepo; parallel to W0–W4)

---

## 0. Doctrine

### 0.1 How we “beat every metric”

Not by cloning Engager feature-for-feature. By:

1. **Matching** table-stakes PM (jobs, portal, automations, letters).  
2. **Exceeding** where Capstone is structurally stronger (AI, money loop, UK intelligence, ecosystem).  
3. **Owning a visual language** Engager cannot copy overnight — **mint metallics + precision density**, not TaxCalc multicolour rainbow.  
4. **Never trading away** proposal→cash for generic PM sprawl.

### 0.2 Target scorecard (end state)

| Dimension | Now (us) | Engager | **Target** | How we win |
| --- | --- | --- | ---: | --- |
| Visual ops craft | 8 | 9 | **10** | Metallic tiles, motion, density without clutter |
| Win work | 9 | 8 | **10** | Clara + formula UX + sales kanban |
| Sign & onboard | 7 | 8 | **9.5** | Portal OS + e-sign forensics + forms |
| Deliver work | 8 | 9 | **9.5** | Board + tasks + tagging + bulk ops |
| Time & profitability | 7 | 8 | **9.5** | Practice-wide P&L, budgets, utilisation |
| Comms & automation | 5 | 9 | **9.5** | Visual builder + packs + optional SMS |
| Admin letters | 7 | 8 | **9** | Designer + live 64-8 track + e-sign |
| Client portal | 5 | 9 | **9.5** | Hub: files, tasks, messages, jobs, sign |
| AI / intelligence | 9 | 3 | **10** | Clara operates board + renewals + risk |
| Money loop | 8 | 6 | **10** | Sign→cash + recurring + dunning + MRR |
| Integrations / GTM | 5 | 9 | **9** | Depth over logo wall; switcher narrative |
| Mobile / trust | ~4 | 9 | **9** | Capacitor + CE/UK story pack |

### 0.3 Sequencing (world domination waves)

```
W0  Visual system “Metal Mint”     ──┐
W1  Delivery + portal OS           ──┼── Product parity+
W2  Automation OS + admin depth    ──┤
W3  Money finish + Clara agentic   ──┤
W4  Mobile, trust, GTM, cutover    ──┘
```

**Hard rule:** W0 ships first on every practice surface so every later feature *looks* like the winner product.

---

## W0 — Visual system “Metal Mint” (big step up)

**Goal:** Open Engage and feel *more premium and more operational* than Engager — not louder for its own sake.

### W0.1 Design language

| Token | Spec |
| --- | --- |
| **Name** | Metal Mint |
| **Page** | Soft cool wash (already started) + optional subtle noise grain at 2–3% opacity |
| **Metal tile** | CSS linear-gradient metallic face: `#F8FAFC → #E2E8F0 → #FFFFFF → #CBD5E1` with mint edge light `rgba(52,211,153,.35)` |
| **Metal dark** | `#0F172A → #1E293B → #334155` with mint specular |
| **Accent** | Capstone mint `#34D399` / hi `#6EE7B7` / deep `#059669` |
| **Semantic metal** | Rose steel (overdue), amber bronze (due soon), sky chrome (in progress), violet steel (help), emerald plate (complete) |
| **Type** | Inter body; **mono kickers** (JetBrains Mono or system mono) uppercase 0.08em tracking for KPI labels |
| **Radius** | 14–16px tiles; 999px chips |
| **Shadow** | Dual layer: soft ambient + crisp 1px inner highlight (faux bevel) |
| **Motion** | 180–220ms ease-out; card lift 2px; ring/bar animate on load; `prefers-reduced-motion` respected |
| **Not this** | TaxCalc rainbow logo as UI chrome; pure neon cyberpunk on every screen; glass soup |

### W0.2 Components to build (canonical)

| Component | Purpose |
| --- | --- |
| `MetalTile` | KPI / column / card shell: bevel, specular, optional accent edge |
| `MetalProgress` | Bar + ring with metallic track + mint fill |
| `Sparkline` | 7–14 day fee / jobs completed on dashboard tiles |
| `ColumnMetalHeader` | Kanban header with metal face + status gem |
| `AvatarMetal` | Staff initials on brushed disc |
| `SegmentedMeter` | Overdue / on-track / complete composition (dashboard) |
| `HeatDot` | Workload density cells |
| `StatusGem` | Small metallic pill for board language |

**Files (implementation home):**

- `frontend/src/components/ui/MetalTile.tsx` (new)  
- Extend `StatusChip.tsx` → re-export Metal*  
- `frontend/src/styles/metal.css` or layer in `base.css` / `index.css`  
- Apply: Jobs board, Job detail, Workload, Dashboard, Letters, Automations, Clients, Portal  

### W0.3 Screen visual pass (priority order)

1. **Jobs board** — metal columns, metal cards, money KPI tiles, animated column avg ring  
2. **Job detail** — metal hero, big ring + dual meters (phase / checklist), margin gauge  
3. **Dashboard** — metal KPI strip + delivery pipeline composition chart  
4. **Workload** — heat row + metal staff headers  
5. **Portal** — client-facing calm metal (less industrial, more trust)  
6. **Proposals list** — chips + progress of “signed this month” sparklines  

### W0.4 Visual success criteria

- [ ] Side-by-side screenshot with Engager: “clearer status, more premium surfaces”  
- [ ] WCAG AA contrast on all metal text  
- [ ] 60fps drag on board (no blur thrash)  
- [ ] Light default; dark still coherent  

**Exit:** Visual score **≥9.5** on internal review.

---

## W1 — Delivery & portal OS (close remaining PM gaps)

| ID | Deliverable | Beats Engager by… |
| --- | --- | --- |
| W1.1 | **Tasks** as first-class entities (assignee, due, tags) under phases | Tagging + dense task lists |
| W1.2 | **@colleague** mentions on job activity + optional Slack/email notify | Colleague tagging parity |
| W1.3 | **Bulk board ops** multi-select move / assign / due | Power-user speed |
| W1.4 | **Portal v2** — tasks for client, secure messages, branded header metal-soft | Portal as OS |
| W1.5 | **Client forms** (records pack questionnaire, KYC lite) | Forms gap |
| W1.6 | **E-sign forensic certificate** (hash, IP, PDF) | Trust over “signed” |
| W1.7 | Utilisation view: capacity hours vs logged | Workload exceed |

**Exit:** Deliver + portal dimensions **≥9**; no partner demo blocked on “can’t message client / no tasks”.

---

## W2 — Automation OS & admin depth

| ID | Deliverable | Beats Engager by… |
| --- | --- | --- |
| W2.1 | **Visual automation builder** (trigger → condition → action) on touchpoints + jobs | Same category as Engager, cleaner UX |
| W2.2 | UK **automation pack library** (VAT due, SA chase, birthday, phase complete, MTD quarter) | Instant value |
| W2.3 | **Clara inside automations** (“rewrite this chase in firm voice”) | Engager cannot |
| W2.4 | Bulk secure email + optional **SMS add-on** (Twilio) | Parity + |
| W2.5 | Read-only **email timeline** (M365/Gmail) linked to Client/Job | Path to two-way |
| W2.6 | **Document designer v1** (blocks: header, services, fees, clauses, sign) | Letter craft |
| W2.7 | Disengage / clearance **e-sign**; 64-8 **status track** + partner/API spike | Admin exceed |
| W2.8 | **Catch-up fees** first-class on proposal wizard | Pricing parity |

**Exit:** Comms **≥9**; admin letters **≥9**.

---

## W3 — Money finish + Clara agentic (category kill shot)

| ID | Deliverable | Beats Engager by… |
| --- | --- | --- |
| W3.1 | Recurring Stripe from monthly lines + **dunning** | Money in-product |
| W3.2 | Practice **MRR / cash under management** metal dashboard | Narrative Engager lacks |
| W3.3 | Job complete → **renewal window** → bulk renew via Clara | Lifecycle loop |
| W3.4 | Clara: **prioritise board** (“3 jobs at risk, draft chases”) | Co-pilot |
| W3.5 | Clara: **meeting notes → tasks** (optional) | Future depth |
| W3.6 | Fee benchmarks (R3) chips on pricing | Network moat |
| W3.7 | Formula pricing builder UX (parity with Engager formulas) | Win-work 10 |

**Exit:** Money **10**; AI **10**; overall product story unassailable in demo.

---

## W4 — Platform, GTM, cutover (world domination logistics)

| ID | Deliverable |
| --- | --- |
| W4.1 | Capacitor **staff jobs + client portal** apps |
| W4.2 | Cyber Essentials prep page + UK residency story |
| W4.3 | **Switch from Engager** landing + ROI calculator + CSV import wizard |
| W4.4 | Pricing packaging vs £9/client (value packaging, not race to bottom) |
| W4.5 | Integrations: finish Xero/QBO push; optional Adfin/GoCardless; **do not fake TaxCalc** — position independence |
| W4.6 | **Cutover** practice → production per `docs/CUTOVER_PREP.md` |
| W4.7 | Sales enablement: battle card, demo script, competitor one-pager |

**Exit:** GTM/mobile/trust **≥9**; production is the practice OS.

---

## 5. Wave map vs Engager gaps (checklist)

| Engager advantage today | Wave that kills it |
| --- | --- |
| Visual board craft | **W0** |
| Jobs / phases / checklists | Done → polish W0–W1 |
| Time profitability | W1.7 + W3 metal P&L |
| Portal / mobile | **W1.4 + W4.1** |
| Automations / bulk email | **W2** |
| Document designer | **W2.6** |
| Live 64-8 | **W2.7** |
| TaxCalc distribution | **W4.3–4.5** narrative + switcher (never depend on TaxCalc) |
| Unlimited users sticker | **W4.4** packaging |

| Engage advantage today | Wave that widens it |
| --- | --- |
| Clara | **W2.3 + W3.4–3.5** |
| Collect at sign | **W3.1–3.2** polish |
| CH → proposal | W3.7 formula UX + Clara |
| Ecosystem | Cross-link Clarity in GTM (W4) |

---

## 6. Implementation order (next 30 days — concrete)

### Week 1 — Metal Mint (W0 only)

1. Ship `MetalTile`, `MetalProgress`, `metal.css` tokens. **✅ 2026-08-02** (`MetalTile.tsx`, `metal.css`)  
2. Restyle Jobs board columns + cards end-to-end. **✅ partial** (metal cards + KPI tiles + bulk select)  
3. Restyle Job detail hero + meters. **✅ partial** (metal hero + tasks panel)  
4. Dashboard metal KPI + overdue composition. **✅**  
5. Screenshot pack vs Engager; adjust contrast. *pending human review*  

### Week 2 — Portal + tasks (W1 start)

1. JobTask model if missing depth; UI on job detail.  
2. Portal tasks + messaging thread (MVP).  
3. Bulk select on board.  

### Week 3 — Automations (W2 start)

1. Visual builder v0 (linear chain, 4 triggers / 4 actions).  
2. UK pack library seeded.  
3. Clara rewrite on chase action.  

### Week 4 — Money + cutover prep (W3/W4)

1. MRR metal dashboard polish.  
2. Recurring dunning states visible.  
3. Switch-from-Engager draft page.  
4. Cutover rehearsal on staging clone.  

---

## 7. Engineering standards (non-negotiable)

- Isolation until cutover: `engage-practice` only; prod untouched for features.  
- Evidence before “done”: e2e + unit for each wave exit.  
- Minimal diff within each PR; one owner per ticket (Tandem).  
- Accessibility: keyboard board moves, ARIA on meters.  
- Performance: virtualise board if >200 cards.  
- No secrets in git; Stripe live keys only via Render.  

---

## 8. Success metrics (product, not vanity)

| Metric | Target |
| --- | --- |
| Time accept → job on board | **&lt; 2s** API; visible immediately |
| Partner demo “looks better than Engager” | **≥80%** yes in blind screenshot (internal) |
| Job board: open → first action | **&lt; 30s** for new user with seed data |
| Chase draft (Clara) usable without edit | **≥50%** send-as-is in pilot |
| Scorecard dimensions ≥9 | **All 11** before claiming domination |
| Production cutover | Explicit William **happy** only |

---

## 9. Messaging — world domination without cringe

**Do say:**

- “Win the work, collect the fee, deliver the job — one product.”  
- “Clara drafts the chase; the board shows the risk.”  
- “Independent of TaxCalc; works with your stack.”  

**Don’t say:**

- “We cloned Engager.”  
- Unsubstantiated firm counts or award claims.  
- “Unlimited free forever” race to bottom.  

Battle card one-liner:

> Engager is excellent practice management.  
> **Engage is practice management attached to the commercial engine and an AI co-pilot.**

---

## 10. Immediate next action (when you say “build”)

1. **W0.1–W0.2** implement MetalMint system + Jobs board restyle.  
2. Update scorecard after W0 with screenshot evidence.  
3. Only then W1 portal/tasks.  

---

## 11. Risk register

| Risk | Mitigation |
| --- | --- |
| Visual “too much metal” = toy | Keep semantic colour; metal is *surface*, status is *gem* |
| Scope explosion | Waves are exit-gated; no W2 until W0 exit |
| TaxCalc lock-in narrative | Never claim TaxCalc parity; own independence |
| Cutover regression | Practice isolation + CUTOVER_PREP checklist |
| Clara cost | Existing cost discipline; draft not free-for-all agent |

---

*This plan supersedes ad-hoc backlog for Engager competition. Living document — update scores after each wave exit.*
