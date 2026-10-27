-- 014: who recorded each collection.
--
-- Set from the signed-in user when a payment (or a midway closure) is
-- recorded; staff_name keeps the name. The Collection page shows the
-- collector and staff can list just their own collections. Collections
-- recorded before this have none ("Legacy Record").

ALTER TABLE collections ADD COLUMN IF NOT EXISTS collected_by_user_id TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS collected_by_role TEXT;

CREATE INDEX IF NOT EXISTS idx_collections_collected_by
  ON collections (tenant_id, collected_by_user_id);
