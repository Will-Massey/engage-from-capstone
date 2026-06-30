-- CreateEnum
CREATE TYPE "ClientRelationship" AS ENUM ('NEW', 'EXISTING');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "clientRelationship" "ClientRelationship" NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "Client_clientRelationship_idx" ON "Client"("clientRelationship");