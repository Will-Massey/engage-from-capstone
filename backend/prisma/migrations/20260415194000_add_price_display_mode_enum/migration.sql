-- Create PriceDisplayMode enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typname = 'PriceDisplayMode') THEN
    CREATE TYPE "PriceDisplayMode" AS ENUM ('PER_MONTH', 'PER_QUARTER', 'PER_YEAR', 'ONE_TIME', 'PER_HOUR', 'PER_UNIT');
  END IF;
END $$;
