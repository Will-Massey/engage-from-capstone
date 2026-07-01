-- Add WITHDRAWN to ProposalStatus enum
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';