ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "understanding_tags" JSONB NOT NULL DEFAULT '[]'::jsonb;
