# Engage MCP — connect your AI

Practices can connect Claude, Cursor, ChatGPT, or any MCP client to their own Engage workspace.

## Endpoint

`POST https://capstonesoftware.co.uk/engage/api/mcp`

Auth: `Authorization: Bearer eng_mcp_…`  
Transport: Streamable HTTP, stateless JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`).

Generate the token in **Integrations → Connect your AI**. It is shown once. Rotate or revoke from the same panel (ADMIN / PARTNER / MD).

## Tools

| Tool                                            | Access                                    |
| ----------------------------------------------- | ----------------------------------------- |
| `engage_practice_summary`                       | read                                      |
| `engage_search_clients` / `engage_get_client`   | read                                      |
| `engage_list_jobs` / `engage_get_job`           | read                                      |
| `engage_list_proposals` / `engage_get_proposal` | read                                      |
| `engage_add_job_note`                           | write (staff note only — no client email) |

Keys are hashed at rest (SHA-256). Tenant isolation is the hashed key, not a JWT cookie. MCP is CSRF-exempt because it never uses ambient session cookies.
