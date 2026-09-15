CREATE TABLE IF NOT EXISTS "mcp_api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Practice AI',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'read,write_notes',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_api_keys_keyHash_key" ON "mcp_api_keys"("keyHash");
CREATE INDEX IF NOT EXISTS "mcp_api_keys_tenantId_revoked_at_idx" ON "mcp_api_keys"("tenantId", "revoked_at");

ALTER TABLE "mcp_api_keys"
  ADD CONSTRAINT "mcp_api_keys_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mcp_api_keys"
  ADD CONSTRAINT "mcp_api_keys_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
