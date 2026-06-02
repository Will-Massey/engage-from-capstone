-- Align ServiceCategory enum with schema.prisma (TECHNICAL, SPECIALIZED)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ServiceCategory'
    AND e.enumlabel = 'TECHNICAL'
  ) THEN
    ALTER TYPE "ServiceCategory" ADD VALUE 'TECHNICAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ServiceCategory'
    AND e.enumlabel = 'SPECIALIZED'
  ) THEN
    ALTER TYPE "ServiceCategory" ADD VALUE 'SPECIALIZED';
  END IF;
END $$;
