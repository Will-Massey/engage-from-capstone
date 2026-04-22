-- AlterTable
ALTER TABLE "Client" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "portalToken" TEXT;
ALTER TABLE "Client" ADD COLUMN "portalTokenExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Client_portalToken_key" ON "Client"("portalToken");
