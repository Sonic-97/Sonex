use sqlx::SqlitePool;
use tracing::info;

/// Run all pending migrations. Tracks applied versions in `_migrations` table.
pub async fn run(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    info!("running database migrations");

    // Ensure migration tracking table exists.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Get already-applied versions.
    let applied: Vec<i32> = sqlx::query_scalar(
        "SELECT version FROM _migrations ORDER BY version",
    )
    .fetch_all(pool)
    .await?;

    let applied_set: std::collections::HashSet<i32> = applied.into_iter().collect();

    // Define all migrations in order.
    let migrations: Vec<(i32, &str, &str)> = vec![
        (1, "initial_schema", INITIAL_SCHEMA),
        (2, "entity_tables", ENTITY_TABLES),
        (3, "sync_infrastructure", SYNC_INFRASTRUCTURE),
        (4, "inventory_enhancements", INVENTORY_ENHANCEMENTS),
        (5, "recipe_engine", RECIPE_ENGINE),
        (6, "pos_engine", POS_ENGINE),

    ];

    for (version, name, sql) in migrations {
        if applied_set.contains(&version) {
            continue;
        }

        info!("applying migration v{}: {}", version, name);

        // Execute each statement in the migration.
        for statement in sql.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                if let Err(e) = sqlx::query(trimmed).execute(pool).await {
                    if is_alter_table_error(&e) {
                        tracing::warn!("alter table skipped (column may already exist): {}", e);
                    } else {
                        return Err(e);
                    }
                }
            }
        }

        // Record the migration.
        sqlx::query(
            "INSERT INTO _migrations (version, name) VALUES (?, ?)",
        )
        .bind(version)
        .bind(name)
        .execute(pool)
        .await?;

        info!("migration v{} applied", version);
    }

    info!("all migrations complete");
    Ok(())
}

/// Check if an error is a harmless "duplicate column" from ALTER TABLE ADD COLUMN.
fn is_alter_table_error(e: &sqlx::Error) -> bool {
    let msg = e.to_string();
    // SQLite error code 1: "duplicate column name"
    msg.contains("duplicate column name")
        || msg.contains("already exists")
}

const INITIAL_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cafes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    cafe_code TEXT,
    owner_code TEXT,
    phone TEXT,
    address TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    location TEXT,
    phone TEXT,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
    payload TEXT NOT NULL,
    local_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','failed','completed'))
);

CREATE TABLE IF NOT EXISTS deleted_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    status TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

const ENTITY_TABLES: &str = r#"
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    cost INTEGER,
    sku TEXT,
    barcode TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    unit TEXT,
    tax_rate INTEGER NOT NULL DEFAULT 0,
    tax_inclusive INTEGER NOT NULL DEFAULT 1,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    tags TEXT,
    is_refrigerated INTEGER NOT NULL DEFAULT 0,
    refrigerator_category_id TEXT,
    prep_time_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_products_cafe_id ON products(cafe_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    unit TEXT NOT NULL DEFAULT 'piece',
    current_qty REAL NOT NULL DEFAULT 0.0,
    min_qty REAL NOT NULL DEFAULT 0.0,
    max_qty REAL NOT NULL DEFAULT 0.0,
    cost_per_unit INTEGER NOT NULL DEFAULT 0,
    supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
    barcode TEXT,
    location TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_cafe_id ON inventory_items(cafe_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier_id ON inventory_items(supplier_id);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 0.0,
    unit TEXT,
    cost INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipes_product_id ON recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient_id ON recipes(ingredient_id);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    tags TEXT,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    last_visit TEXT,
    birth_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'BARISTA',
    login_code TEXT,
    password_hash TEXT,
    pin_code TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    hourly_wage INTEGER,
    salary_type TEXT DEFAULT 'MONTHLY',
    avatar_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_cafe_id ON staff(cafe_id);
CREATE INDEX IF NOT EXISTS idx_staff_login_code ON staff(login_code);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_id TEXT,
    notes TEXT,
    payment_terms TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_suppliers_cafe_id ON suppliers(cafe_id);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    expense_date TEXT NOT NULL,
    paid_by TEXT REFERENCES staff(id) ON DELETE SET NULL,
    receipt_url TEXT,
    approved_by TEXT REFERENCES staff(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_cafe_id ON expenses(cafe_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    order_id TEXT,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    method TEXT NOT NULL DEFAULT 'CASH',
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    paid_by TEXT REFERENCES staff(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_cafe_id ON payments(cafe_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);

CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    order_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT REFERENCES staff(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
"#;

const SYNC_INFRASTRUCTURE: &str = r#"
ALTER TABLE sync_queue ADD COLUMN idempotency_key TEXT;
ALTER TABLE sync_queue ADD COLUMN last_attempt_at TEXT;
ALTER TABLE sync_queue ADD COLUMN next_retry_at TEXT;

CREATE TABLE IF NOT EXISTS sync_state (
    cafe_id TEXT PRIMARY KEY,
    last_sync_version INTEGER NOT NULL DEFAULT 0,
    last_download_version INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
"#;

const INVENTORY_ENHANCEMENTS: &str = r#"
CREATE TABLE IF NOT EXISTS inventory_categories (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inv_cat_cafe_id ON inventory_categories(cafe_id);

ALTER TABLE inventory_items ADD COLUMN purchase_unit TEXT;
ALTER TABLE inventory_items ADD COLUMN consumption_unit TEXT;
ALTER TABLE inventory_items ADD COLUMN conversion_ratio REAL NOT NULL DEFAULT 1.0;
ALTER TABLE inventory_items ADD COLUMN inventory_category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    quantity REAL NOT NULL,
    previous_qty REAL NOT NULL,
    new_qty REAL NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('IN','OUT','ADJUSTMENT','TRANSFER','RETURN','WASTE')),
    reference_type TEXT,
    reference_id TEXT,
    notes TEXT,
    cost_per_unit INTEGER,
    total_cost INTEGER
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_cafe ON stock_movements(cafe_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
"#;

const RECIPE_ENGINE: &str = r#"
ALTER TABLE recipes ADD COLUMN waste_percent REAL NOT NULL DEFAULT 0.0;
"#;

const POS_ENGINE: &str = r#"
CREATE TABLE IF NOT EXISTS pos_orders (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    order_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    items_json TEXT NOT NULL DEFAULT '[]',
    payments_json TEXT NOT NULL DEFAULT '[]',
    discounts_json TEXT NOT NULL DEFAULT '[]',
    refunds_json TEXT NOT NULL DEFAULT '[]',
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount_total INTEGER NOT NULL DEFAULT 0,
    grand_total INTEGER NOT NULL DEFAULT 0,
    paid_total INTEGER NOT NULL DEFAULT 0,
    change_total INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    customer_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'pos',
    created_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_cafe ON pos_orders(cafe_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created ON pos_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_orders_number ON pos_orders(cafe_id, order_number);

CREATE TABLE IF NOT EXISTS pos_favorites (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(cafe_id, staff_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_favorites_staff ON pos_favorites(cafe_id, staff_id);

CREATE TABLE IF NOT EXISTS pos_modifier_groups (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_select INTEGER NOT NULL DEFAULT 0,
    max_select INTEGER NOT NULL DEFAULT 1,
    required INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mod_groups_cafe ON pos_modifier_groups(cafe_id);

CREATE TABLE IF NOT EXISTS pos_modifier_options (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_adjustment INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mod_options_group ON pos_modifier_options(group_id);

CREATE TABLE IF NOT EXISTS pos_product_modifiers (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS pos_audit_log (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    staff_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_cafe ON pos_audit_log(cafe_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON pos_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON pos_audit_log(action);

CREATE TABLE IF NOT EXISTS pos_printers (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    printer_type TEXT NOT NULL DEFAULT 'thermal',
    interface TEXT NOT NULL DEFAULT 'file',
    address TEXT,
    port INTEGER,
    paper_width INTEGER NOT NULL DEFAULT 80,
    chars_per_line INTEGER NOT NULL DEFAULT 42,
    active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_printers_cafe ON pos_printers(cafe_id);

CREATE TABLE IF NOT EXISTS pos_refunds (
    id TEXT PRIMARY KEY NOT NULL,
    cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    items_json TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON pos_refunds(order_id);

ALTER TABLE products ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
"#;


