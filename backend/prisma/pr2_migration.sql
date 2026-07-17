-- ============================================================
-- PR #2: Data Migration — Order + InCafeOrder → UnifiedOrder
-- Preserves all existing data. Fully reversible.
-- PostgreSQL identifiers: quoted camelCase, unquoted snake_case
-- ============================================================

BEGIN;

-- ============================================================
-- PHASE 1: Migrate "Order" → unified_orders
-- ============================================================
INSERT INTO unified_orders (
  id, cafe_id, branch_id, code,
  channel, source,
  status, "cancelStatus",
  "paymentStatus",
  subtotal, "discountTotal", "grandTotal",
  "amountPaid", "changeTotal", "remainingAmount",
  profit,
  "customerId", "customerName", "customerPhone",
  created_by_id, collected_by_id, "collectedRole", employee_id,
  "driverId",
  address,
  "orderType", "tableNumber", "sourceType",
  priority, notes, "voidReason",
  "stockDeducted", "isRevenueConfirmed",
  "externalId",
  version,
  legacy_id, legacy_table,
  "createdAt", "confirmedAt", "preparedAt", "readyAt",
  "pickedUpAt", "deliveredAt", "paidAt", "closedAt", "cancelledAt",
  "updatedAt"
)
SELECT
  o.id,
  o.cafe_id, o.branch_id, o.code,
  CASE
    WHEN o.source = 'DELIVERY' THEN 'DELIVERY'
    WHEN o.source = 'PICKUP'   THEN 'PICKUP'
    ELSE 'IN_CAFE'
  END,
  'LEGACY_ORDER',
  o.status, NULL,
  o."paymentStatus",
  o.total, 0, o.total,
  o."amountPaid", 0, o."remainingAmount",
  o.profit,
  o."customerId", c.name, c.phone,
  o.created_by_id, o.collected_by_id, o."collectedRole", o.employee_id,
  o."driverId",
  o.address,
  o.type, NULL, o."sourceType",
  'NORMAL', NULL, NULL,
  o."stockDeducted", o."isRevenueConfirmed",
  o.external_id,
  o.version,
  o.id, 'Order',
  o."createdAt", o."confirmedAt", o."preparedAt", o."readyAt",
  o."pickedUpAt", o."deliveredAt", o."paidAt", o."closedAt", o."cancelledAt",
  NOW()
FROM "Order" o
LEFT JOIN customers c ON c.id = o."customerId"
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PHASE 2: Migrate in_cafe_orders → unified_orders
-- Skip records whose code already exists (Telegram dual-record
-- duplicates — Order takes priority). These are logged in
-- validation for later reconciliation (PR #3).
-- ============================================================
INSERT INTO unified_orders (
  id, cafe_id, branch_id, code,
  channel, source,
  status, "cancelStatus",
  "paymentStatus",
  subtotal, "discountTotal", "grandTotal",
  "amountPaid", "changeTotal", "remainingAmount",
  profit,
  "customerId", "customerName", "customerPhone",
  created_by_id, collected_by_id, "collectedRole", employee_id,
  "driverId", address,
  "orderType", "tableNumber", "sourceType",
  priority, notes, "voidReason",
  "stockDeducted", "isRevenueConfirmed",
  "externalId", version,
  legacy_id, legacy_table,
  "createdAt", "confirmedAt", "preparedAt", "readyAt",
  "pickedUpAt", "deliveredAt", "paidAt", "cancelledAt", "voidedAt",
  "updatedAt"
)
SELECT
  ico.id, ico.cafe_id, ico.branch_id, ico.code,
  'IN_CAFE',
  CASE
    WHEN ico."sourceType" = 'TELEGRAM_ORDER' THEN 'TELEGRAM'
    WHEN ico."sourceType" = 'WHATSAPP_ORDER' THEN 'WHATSAPP'
    ELSE 'LEGACY_POS'
  END,
  ico.status,
  CASE WHEN ico."voidReason" IS NOT NULL THEN 'VOID' ELSE NULL END,
  CASE
    WHEN ico."paymentStatus" = 'NOT_PAID' THEN 'UNPAID'
    WHEN ico."paymentStatus" = 'PAID' THEN 'PAID'
    WHEN ico."paymentStatus" = 'PARTIAL' THEN 'PARTIALLY_PAID'
    ELSE ico."paymentStatus"
  END,
  ico.total, 0, ico.total,
  ico."paidAmount", 0, ico."remainingBalance",
  NULL,
  ico.customer_id, ico."customerName", ico."customerPhone",
  ico.created_by_id, NULL, NULL, ico.employee_id,
  NULL, NULL,
  ico."orderType", ico."tableNumber", ico."sourceType",
  'NORMAL', ico.notes, ico."voidReason",
  ico."stockDeducted", ico."isRevenueConfirmed",
  NULL, 1,
  ico.id, 'InCafeOrder',
  ico."createdAt", NULL, NULL, NULL,
  NULL, NULL, ico."paymentTimestamp",
  NULL,
  CASE WHEN ico."voidReason" IS NOT NULL THEN ico."updatedAt" ELSE NULL END,
  ico."updatedAt"
FROM in_cafe_orders ico
WHERE NOT EXISTS (
  SELECT 1 FROM unified_orders uo WHERE uo.code = ico.code
);

-- ============================================================
-- PHASE 3: Status history — fulfillment status
-- ============================================================
INSERT INTO unified_order_status_histories (
  id, cafe_id, order_id,
  from_status, to_status,
  changed_by, "changeType", reason,
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  uo.cafe_id, uo.id,
  'MIGRATED', uo.status,
  'SYSTEM', 'MIGRATION', 'Migrated from ' || uo.legacy_table,
  uo."createdAt"
FROM unified_orders uo
WHERE uo.legacy_table IN ('Order', 'InCafeOrder');

-- ============================================================
-- PHASE 4: Migrate "OrderItem" → unified_order_items
-- ============================================================
INSERT INTO unified_order_items (
  id, cafe_id, branch_id, order_id,
  product_id, quantity, "unitPrice",
  "discountAmount", notes,
  "preparationStatus"
)
SELECT
  oi.id,
  uo.cafe_id, uo.branch_id, uo.id,
  oi."productId", oi.quantity, oi."unitPrice",
  0, oi.notes,
  'PENDING'
FROM "OrderItem" oi
JOIN unified_orders uo
  ON uo.legacy_id = oi."orderId"
  AND uo.legacy_table = 'Order'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PHASE 5: Migrate in_cafe_order_items → unified_order_items
-- ============================================================
INSERT INTO unified_order_items (
  id, cafe_id, branch_id, order_id,
  product_id, quantity, "unitPrice",
  "discountAmount", notes,
  "preparationStatus"
)
SELECT
  icoi.id,
  icoi.cafe_id, uo.branch_id, uo.id,
  icoi.product_id, icoi.quantity, icoi."unitPrice",
  0, icoi.notes,
  'PENDING'
FROM in_cafe_order_items icoi
JOIN unified_orders uo
  ON uo.legacy_id = icoi.order_id
  AND uo.legacy_table = 'InCafeOrder'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PHASE 6: Payment status history
-- ============================================================
INSERT INTO unified_order_status_histories (
  id, cafe_id, order_id,
  from_status, to_status,
  changed_by, "changeType", reason,
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  uo.cafe_id, uo.id,
  'NONE',
  CASE uo."paymentStatus"
    WHEN 'PAID' THEN 'PAYMENT_PAID'
    WHEN 'PARTIALLY_PAID' THEN 'PAYMENT_PARTIAL'
    WHEN 'UNPAID' THEN 'PAYMENT_UNPAID'
    ELSE 'PAYMENT_' || uo."paymentStatus"
  END,
  'SYSTEM', 'PAYMENT',
  'Initial payment from ' || uo.legacy_table,
  COALESCE(uo."paidAt", uo."createdAt")
FROM unified_orders uo
WHERE uo.legacy_table IN ('Order', 'InCafeOrder')
  AND NOT EXISTS (
    SELECT 1 FROM unified_order_status_histories h
    WHERE h.order_id = uo.id AND h."changeType" = 'PAYMENT'
  );

-- ============================================================
-- VALIDATION
-- ============================================================
DO $$
DECLARE
  v_orders_migrated INT;
  v_incafe_migrated INT;
  v_incafe_skipped INT;
  v_items_from_order INT;
  v_items_from_incafe INT;
  v_total_unified INT;
  v_total_items INT;
  v_total_history INT;
  v_order_total NUMERIC;
  v_incafe_total NUMERIC;
  v_orphan_items INT;
  v_orphan_history INT;
  v_duplicate_codes INT;
BEGIN
  SELECT COUNT(*) INTO v_orders_migrated   FROM unified_orders WHERE legacy_table = 'Order';
  SELECT COUNT(*) INTO v_incafe_migrated   FROM unified_orders WHERE legacy_table = 'InCafeOrder';
  SELECT COUNT(*) INTO v_items_from_order  FROM unified_order_items uoi JOIN unified_orders uo ON uo.id = uoi.order_id WHERE uo.legacy_table = 'Order';
  SELECT COUNT(*) INTO v_items_from_incafe FROM unified_order_items uoi JOIN unified_orders uo ON uo.id = uoi.order_id WHERE uo.legacy_table = 'InCafeOrder';
  SELECT COUNT(*) INTO v_total_unified FROM unified_orders;
  SELECT COUNT(*) INTO v_total_items   FROM unified_order_items;
  SELECT COUNT(*) INTO v_total_history FROM unified_order_status_histories;

  -- Detect InCafeOrder rows skipped due to code collision
  SELECT COUNT(*) INTO v_incafe_skipped
  FROM in_cafe_orders ico
  WHERE EXISTS (SELECT 1 FROM unified_orders uo WHERE uo.code = ico.code AND uo.legacy_table = 'Order');

  -- Orphan checks
  SELECT COUNT(*) INTO v_orphan_items
  FROM unified_order_items uoi
  LEFT JOIN unified_orders uo ON uo.id = uoi.order_id
  WHERE uo.id IS NULL;

  SELECT COUNT(*) INTO v_orphan_history
  FROM unified_order_status_histories h
  LEFT JOIN unified_orders uo ON uo.id = h.order_id
  WHERE uo.id IS NULL;

  -- Cross-check: codes that exist in BOTH legacy tables
  SELECT COUNT(*) INTO v_duplicate_codes
  FROM (SELECT code FROM "Order" INTERSECT SELECT code FROM in_cafe_orders) d;

  SELECT COALESCE(SUM("grandTotal"), 0) INTO v_order_total  FROM unified_orders WHERE legacy_table = 'Order';
  SELECT COALESCE(SUM("grandTotal"), 0) INTO v_incafe_total FROM unified_orders WHERE legacy_table = 'InCafeOrder';

  RAISE NOTICE '============================================';
  RAISE NOTICE 'PR #2 MIGRATION VALIDATION';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Orders migrated:          % (legacy: 24)', v_orders_migrated;
  RAISE NOTICE 'InCafeOrders migrated:    % (legacy: 3)', v_incafe_migrated;
  RAISE NOTICE 'InCafeOrders skipped:     % (code collision with Order)', v_incafe_skipped;
  RAISE NOTICE 'Total unified orders:     %', v_total_unified;
  RAISE NOTICE 'Order items migrated:     % (legacy: 27)', v_items_from_order;
  RAISE NOTICE 'InCafe items migrated:    % (legacy: 3)', v_items_from_incafe;
  RAISE NOTICE 'Total unified items:      %', v_total_items;
  RAISE NOTICE 'Total status history:     %', v_total_history;
  RAISE NOTICE 'Orphan items:             % (should be 0)', v_orphan_items;
  RAISE NOTICE 'Orphan history entries:   % (should be 0)', v_orphan_history;
  RAISE NOTICE 'Dual-table code overlap:  %', v_duplicate_codes;
  RAISE NOTICE 'Order total sum (EGP):    %', v_order_total;
  RAISE NOTICE 'InCafe total sum (EGP):   %', v_incafe_total;
  RAISE NOTICE '============================================';

  -- Assertions
  IF v_orphan_items > 0 THEN
    RAISE EXCEPTION 'FATAL: % orphan order items detected', v_orphan_items;
  END IF;
  IF v_orphan_history > 0 THEN
    RAISE EXCEPTION 'FATAL: % orphan status history entries detected', v_orphan_history;
  END IF;
END $$;

COMMIT;
