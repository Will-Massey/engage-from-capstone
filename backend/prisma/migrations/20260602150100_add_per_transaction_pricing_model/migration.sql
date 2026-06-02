-- Align PricingModel enum with schema.prisma (PER_TRANSACTION)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PricingModel'
    AND e.enumlabel = 'PER_TRANSACTION'
  ) THEN
    ALTER TYPE "PricingModel" ADD VALUE 'PER_TRANSACTION';
  END IF;
END $$;
