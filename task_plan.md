# Engage Build Plan (post-cutover + Capstone Tandem)

## Goal

Exceed Engager on practice ops while defending proposal→cash + Clara.  
**Production live** on Neon + Render: https://capstonesoftware.co.uk/engage

## Capstone Tandem (Engage ↔ AccountFlow)

| Direction | Mechanism |
|-----------|-----------|
| Engage → AF | Handoff HTTP + `publishTandemEvent` on job spawn / column / complete |
| AF → Engage | `POST /api/integrations/accountflow/inbound` + AF `notifyEngageInbound` |
| Default | `ACCOUNTFLOW_MESH_MODE=mock` (prod AF never contacted) |

### Local symbiotic loop

```
# AccountFlow (accountflow-practice feat/mesh-sandbox)
ENGAGE_BASE_URL=http://localhost:3101
ENGAGE_MESH_SECRET=<shared>

# Engage
ACCOUNTFLOW_MESH_MODE=local
ACCOUNTFLOW_BASE_URL=http://localhost:3000
ACCOUNTFLOW_API_KEY=af_live_…
ACCOUNTFLOW_MESH_INBOUND_SECRET=<shared>
ENGAGE_PUBLIC_URL=http://localhost:5273
```

## Next up

1. Merge tandem bi-di mesh PR  
2. Sales board PR #94  
3. Mailbox OAuth depth  
4. Portal / bulk forms polish  
5. iOS after desktop solid  

## Done

- Practice OS cutover (2026-08-02)  
- Railway refs removed (#93)  
- Tandem HTTP adapter + bi-di events (this branch)  
