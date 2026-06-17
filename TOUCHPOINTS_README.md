# Client Touchpoint Workflow (Automated Onboarding)

## What was built (all 6 requested areas)

1. **Data model**
   - `ClientLifecycleStage` enum (13 stages)
   - `Touchpoint` and `TouchpointTemplate` tables
   - Client extensions: `lifecycleStage`, `touchpointsPaused`, `marketingConsent`, key due dates, AML/engagement timestamps

2. **Trigger engine** (`src/jobs/touchpointEngine.ts`)
   - `runTouchpointEngine()` background job
   - Event triggers vs time-delay evaluation
   - Human approval gating
   - Marketing consent gate
   - Info chase escalation (3 reminders → human flag)
   - Deadline reminders from actual client due dates
   - Full ActivityLog audit trail

3. **Admin UI**
   - Settings → Automation tab: per-stage template editor, global on/off toggles, approval queue, manual run
   - Client detail → Lifecycle tab: pause entire sequence, marketing consent toggle, activity timeline

4. **Stage logic**
   - AML + welcome created in parallel on proposal acceptance
   - Info chase escalates with tone
   - Deadlines come from client record fields
   - Satisfaction/review respects `marketingConsent`

5. **Integration**
   - Uses existing EmailService
   - SMS stub + optional Twilio path
   - Webhook on stage change (`TOUCHPOINT_WEBHOOK_URL` or tenant settings)
   - Triggers wired into proposal acceptance + explicit endpoints

6. **Tests + seeding**
   - `src/jobs/__tests__/touchpointEngine.test.ts`
   - `src/scripts/seed-touchpoint-templates.ts <tenantId>`

## Quick start

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name add_client_touchpoint_workflow
# or deploy: npx prisma migrate deploy

# Seed defaults for a tenant
npx tsx src/scripts/seed-touchpoint-templates.ts <tenant-uuid>

npm run dev
```

The engine runs every 15 minutes automatically.

Manual trigger: POST /api/touchpoints/run (auth required)

## Key endpoints

- GET/PUT /api/touchpoints/templates/:stage
- GET /api/touchpoints/approvals
- POST /api/touchpoints/:id/approve
- PATCH /api/touchpoints/clients/:clientId  (pause, consent)
- POST /api/clients/:id/aml-complete
- POST /api/clients/:id/info-received
- GET /api/clients/:id/activity
- POST /api/clients/:id/schedule-deadline-reminders
