-- ============================================================
-- PR #2: ROLLBACK — Remove all migrated Unified Order data
-- Restores database to pre-PR2 state.
-- Does NOT drop tables (tables were created by PR #1 schema).
-- Only removes data inserted by pr2_migration.sql.
-- ============================================================

BEGIN;

-- Remove migrated status history entries
DELETE FROM unified_order_status_histories
WHERE "changeType" = 'MIGRATION'
   OR "changeType" = 'PAYMENT';

-- Remove migrated refund entries (none in initial migration, but safe)
DELETE FROM unified_refunds;

-- Remove migrated order items
DELETE FROM unified_order_items;

-- Remove migrated orders (only those with legacy_table set)
DELETE FROM unified_orders
WHERE legacy_table IS NOT NULL;

-- ============================================================
-- VALIDATION: Verify cleanup
-- ============================================================
DO $$
DECLARE
  v_unified_remaining INT;
  v_items_remaining INT;
  v_history_remaining INT;
  v_refunds_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_unified_remaining FROM unified_orders;
  SELECT COUNT(*) INTO v_items_remaining FROM unified_order_items;
  SELECT COUNT(*) INTO v_history_remaining FROM unified_order_status_histories;
  SELECT COUNT(*) INTO v_refunds_remaining FROM unified_refunds;

  RAISE NOTICE '=== ROLLBACK SUMMARY ===';
  RAISE NOTICE 'Remaining unified orders: % (should be 0)', v_unified_remaining;
  RAISE NOTICE 'Remaining unified items: % (should be 0)', v_items_remaining;
  RAISE NOTICE 'Remaining status history: % (should be 0)', v_history_remaining;
  RAISE NOTICE 'Remaining refunds: % (should be 0)', v_refunds_remaining;
  RAISE NOTICE '=== END ROLLBACK ===';
END $$;

COMMIT;
