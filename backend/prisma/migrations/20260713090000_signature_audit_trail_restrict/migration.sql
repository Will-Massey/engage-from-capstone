-- E-sign audit trail immutability: the ProposalSignature -> Proposal foreign key
-- changes from ON DELETE CASCADE to ON DELETE RESTRICT so a proposal that has
-- recorded signatures can no longer be hard-deleted (which would destroy the
-- legally-retained signature records). Proposal deletion with signatures is also
-- blocked in the route layer; GDPR erasure anonymizes/retains rather than deletes.

-- DropForeignKey
ALTER TABLE "ProposalSignature" DROP CONSTRAINT "ProposalSignature_proposalId_fkey";

-- AddForeignKey
ALTER TABLE "ProposalSignature" ADD CONSTRAINT "ProposalSignature_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
