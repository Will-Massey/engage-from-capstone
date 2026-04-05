-- Add PER_EMPLOYEE to PricingModel enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PricingModel'
    AND e.enumlabel = 'PER_EMPLOYEE'
  ) THEN
    ALTER TYPE "PricingModel" ADD VALUE 'PER_EMPLOYEE';
  END IF;
END $$;
