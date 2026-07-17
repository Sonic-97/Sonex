pub mod types;

use tracing::info;

use crate::db::category::CategoryRepo;
use crate::db::error::{DbError, DbResult};
use crate::db::inventory::InventoryRepo;
use crate::db::pos_audit::{NewAuditEntry, PosAuditRepo};
use crate::db::pos_favorite::PosFavoriteRepo;
use crate::db::pos_modifier::PosModifierRepo;
use crate::db::pos_order::{NewPosOrder, PosOrderRepo, UpdatePosOrder};
use crate::db::pos_printer::{PosPrinterRepo, Printer, PrinterInput};
use crate::db::product::ProductRepo;
use crate::db::recipe::RecipeRepo;
use crate::db::repo::{new_id, now};
use crate::db::stock_movement::{NewStockMovement, StockMovementRepo};
use crate::db::Database;
use crate::pos_engine::types::*;

/// POS Engine — core business logic for point-of-sale operations.
pub struct POSEngine {
    db: Database,
}

impl POSEngine {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    // ─── Product Search ───────────────────────────────────────

    pub async fn search_products(&self, cafe_id: &str, query: &str) -> DbResult<Vec<ProductSearchResult>> {
        let products = ProductRepo::search(&self.db, cafe_id, query).await?;
        let mut results = Vec::with_capacity(products.len());
        for p in products {
            let has_modifiers = PosModifierRepo::get_product_group_ids(&self.db, &p.id)
                .await
                .map(|g| !g.is_empty())
                .unwrap_or(false);
            results.push(ProductSearchResult {
                id: p.id,
                name: p.name,
                price: p.price,
                barcode: p.barcode.clone(),
                category_id: p.category_id.clone(),
                category_name: None,
                active: p.active != 0,
                has_modifiers,
            });
        }
        Ok(results)
    }

    pub async fn find_by_barcode(&self, cafe_id: &str, barcode: &str) -> DbResult<Option<ProductSearchResult>> {
        let product = ProductRepo::find_by_barcode(&self.db, cafe_id, barcode).await?;
        match product {
            Some(p) => {
                let has_modifiers = PosModifierRepo::get_product_group_ids(&self.db, &p.id)
                    .await
                    .map(|g| !g.is_empty())
                    .unwrap_or(false);
                Ok(Some(ProductSearchResult {
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    barcode: p.barcode,
                    category_id: p.category_id,
                    category_name: None,
                    active: p.active != 0,
                    has_modifiers,
                }))
            }
            None => Ok(None),
        }
    }

    // ─── Categories ────────────────────────────────────────────

    pub async fn get_categories_with_products(&self, cafe_id: &str) -> DbResult<Vec<CategoryWithProducts>> {
        let categories = CategoryRepo::find_active(&self.db, cafe_id).await?;
        let all_products = ProductRepo::find_active(&self.db, cafe_id).await?;

        let mut results: Vec<CategoryWithProducts> = categories.into_iter().map(|cat| {
            let products = all_products.iter().filter(|p| p.category_id.as_deref() == Some(&cat.id)).map(|p| {
                ProductSearchResult {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    price: p.price,
                    barcode: p.barcode.clone(),
                    category_id: Some(cat.id.clone()),
                    category_name: Some(cat.name.clone()),
                    active: p.active != 0,
                    has_modifiers: false,
                }
            }).collect();
            CategoryWithProducts {
                id: cat.id,
                name: cat.name,
                emoji: cat.emoji,
                products,
            }
        }).collect();

        // Add all products at the top
        let all: Vec<ProductSearchResult> = all_products.into_iter().map(|p| ProductSearchResult {
            id: p.id,
            name: p.name,
            price: p.price,
            barcode: p.barcode,
            category_id: p.category_id,
            category_name: None,
            active: p.active != 0,
            has_modifiers: false,
        }).collect();

        results.insert(0, CategoryWithProducts {
            id: String::new(),
            name: "الكل".into(),
            emoji: None,
            products: all,
        });

        Ok(results)
    }

    // ─── Favorites ─────────────────────────────────────────────

    pub async fn get_favorites(&self, cafe_id: &str, staff_id: &str) -> DbResult<Vec<crate::db::pos_favorite::FavoriteWithProduct>> {
        PosFavoriteRepo::find_by_staff(&self.db, cafe_id, staff_id).await
    }

    pub async fn toggle_favorite(&self, cafe_id: &str, staff_id: &str, product_id: &str) -> DbResult<bool> {
        PosFavoriteRepo::toggle(&self.db, cafe_id, staff_id, product_id).await
    }

    // ─── Modifiers ─────────────────────────────────────────────

    pub async fn get_product_modifiers(&self, cafe_id: &str, product_id: &str) -> DbResult<Vec<crate::db::pos_modifier::ModifierGroupWithOptions>> {
        PosModifierRepo::get_groups_with_options(&self.db, cafe_id, Some(product_id)).await
    }

    // ─── Order Management ─────────────────────────────────────

    pub async fn create_order(&self, cafe_id: &str, input: &CreatePOSOrder) -> DbResult<POSOrder> {
        let order_number = PosOrderRepo::next_number(&self.db, cafe_id).await?;
        let subtotal: i64 = input.items.iter().map(|i| i.subtotal).sum();
        let discount_total = self.calculate_discount_total(&input.discounts, subtotal);
        let grand_total = (subtotal - discount_total).max(0);
        let paid_total: i64 = input.payments.iter().map(|p| p.amount).sum();
        let change_total = (paid_total - grand_total).max(0);
        let payment_status = if paid_total >= grand_total && grand_total > 0 {
            "paid"
        } else if paid_total > 0 {
            "partial"
        } else {
            "unpaid"
        };

        let items_json = serde_json::to_string(&input.items).unwrap_or_else(|_| "[]".into());
        let payments_json = {
            let records: Vec<PaymentRecord> = input.payments.iter().map(|p| PaymentRecord {
                id: new_id(),
                method: p.method.clone(),
                amount: p.amount,
                reference: p.reference.clone(),
                created_at: now(),
            }).collect();
            serde_json::to_string(&records).unwrap_or_else(|_| "[]".into())
        };
        let discounts_json = {
            let records: Vec<DiscountRecord> = input.discounts.iter().map(|d| DiscountRecord {
                id: new_id(),
                name: d.name.clone(),
                discount_type: d.discount_type.clone(),
                value: d.value,
                amount: if d.discount_type == "percentage" { (subtotal as f64 * d.value as f64 / 100.0) as i64 } else { d.value },
                item_id: d.item_id.clone(),
            }).collect();
            serde_json::to_string(&records).unwrap_or_else(|_| "[]".into())
        };

        let status = if paid_total >= grand_total && grand_total > 0 { "completed".into() } else { "pending".into() };

        let new_order = NewPosOrder {
            order_number,
            status,
            items_json,
            payments_json,
            discounts_json,
            refunds_json: "[]".into(),
            subtotal,
            discount_total,
            grand_total,
            paid_total,
            change_total,
            payment_status: payment_status.into(),
            customer_id: input.customer_id.clone(),
            customer_name: input.customer_name.clone(),
            customer_phone: input.customer_phone.clone(),
            notes: input.notes.clone(),
            source: input.source.clone().unwrap_or_else(|| "pos".into()),
            created_by: input.created_by.clone(),
        };

        let order_id = PosOrderRepo::insert(&self.db, cafe_id, &new_order).await?;

        self.log_audit(cafe_id, &NewAuditEntry {
            action: "create_order".into(),
            entity_type: "order".into(),
            entity_id: Some(order_id.clone()),
            staff_id: input.created_by.clone(),
            details_json: Some(format!(r#"{{"order_number":{},"grand_total":{},"item_count":{}}}"#, order_number, grand_total, input.items.len())),
        }).await?;

        info!("order created: #{} ({})", order_number, order_id);
        self.get_order_internal(cafe_id, &order_id).await
    }

    pub async fn get_order(&self, cafe_id: &str, order_id: &str) -> DbResult<Option<POSOrder>> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id).await?;
        match order {
            Some(o) => Ok(Some(self.db_order_to_pos(&o))),
            None => Ok(None),
        }
    }

    pub async fn get_today_orders(&self, cafe_id: &str) -> DbResult<Vec<POSOrder>> {
        let orders = PosOrderRepo::find_all(&self.db, cafe_id, None).await?;
        Ok(orders.iter().map(|o| self.db_order_to_pos(o)).collect())
    }

    pub async fn get_active_orders(&self, cafe_id: &str) -> DbResult<Vec<POSOrder>> {
        let orders = PosOrderRepo::find_active(&self.db, cafe_id).await?;
        Ok(orders.iter().map(|o| self.db_order_to_pos(o)).collect())
    }

    pub async fn next_order_number(&self, cafe_id: &str) -> DbResult<i64> {
        PosOrderRepo::next_number(&self.db, cafe_id).await
    }

    // ─── Payment ───────────────────────────────────────────────

    pub async fn add_payment(&self, cafe_id: &str, order_id: &str, payment: &PaymentInput, staff_id: Option<&str>) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        let mut payments: Vec<PaymentRecord> = serde_json::from_str(&order.payments_json).unwrap_or_default();
        payments.push(PaymentRecord {
            id: new_id(),
            method: payment.method.clone(),
            amount: payment.amount,
            reference: payment.reference.clone(),
            created_at: now(),
        });

        let new_paid_total: i64 = payments.iter().map(|p| p.amount).sum();
        let payment_status = if new_paid_total >= order.grand_total { "paid" } else { "partial" };
        let change_total = (new_paid_total - order.grand_total).max(0);

        let update = UpdatePosOrder {
            id: order_id.to_string(),
            cafe_id: cafe_id.to_string(),
            version: order.version,
            status: Some("completed".into()),
            items_json: None,
            payments_json: Some(serde_json::to_string(&payments).unwrap_or_default()),
            discounts_json: None,
            refunds_json: None,
            subtotal: None,
            discount_total: None,
            grand_total: None,
            paid_total: Some(new_paid_total),
            change_total: Some(change_total),
            payment_status: Some(payment_status.into()),
            customer_id: None,
            customer_name: None,
            notes: None,
            source: None,
        };

        PosOrderRepo::update_fields(&self.db, &update).await?;

        if payment_status == "paid" {
            let items: Vec<OrderItem> = serde_json::from_str(&order.items_json).unwrap_or_default();
            if !items.is_empty() {
                self.deduct_inventory(cafe_id, &items).await.ok();
                self.consume_recipes(cafe_id, &items).await.ok();
            }
        }

        self.log_audit(cafe_id, &NewAuditEntry {
            action: "add_payment".into(),
            entity_type: "order".into(),
            entity_id: Some(order_id.into()),
            staff_id: staff_id.map(|s| s.to_string()),
            details_json: Some(format!(r#"{{"method":"{}","amount":{},"payment_status":"{}"}}"#, payment.method, payment.amount, payment_status)),
        }).await?;

        let updated = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&updated))
    }

    // ─── Discount ──────────────────────────────────────────────

    pub async fn apply_discount(&self, cafe_id: &str, order_id: &str, discount: &DiscountInput, staff_id: Option<&str>) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        let items: Vec<OrderItem> = serde_json::from_str(&order.items_json).unwrap_or_default();
        let mut discounts: Vec<DiscountRecord> = serde_json::from_str(&order.discounts_json).unwrap_or_default();

        let subtotal: i64 = items.iter().map(|i| i.subtotal).sum();
        let amount = if discount.discount_type == "percentage" {
            if let Some(ref item_id) = discount.item_id {
                let item_sub = items.iter().find(|i| i.id == *item_id).map(|i| i.subtotal).unwrap_or(0);
                (item_sub as f64 * discount.value as f64 / 100.0) as i64
            } else {
                (subtotal as f64 * discount.value as f64 / 100.0) as i64
            }
        } else {
            discount.value
        };

        discounts.push(DiscountRecord {
            id: new_id(),
            name: discount.name.clone(),
            discount_type: discount.discount_type.clone(),
            value: discount.value,
            amount,
            item_id: discount.item_id.clone(),
        });

        let discount_total: i64 = discounts.iter().map(|d| d.amount).sum();
        let grand_total = (subtotal - discount_total).max(0);

        let update = UpdatePosOrder {
            id: order_id.to_string(),
            cafe_id: cafe_id.to_string(),
            version: order.version,
            status: None,
            items_json: None,
            payments_json: None,
            discounts_json: Some(serde_json::to_string(&discounts).unwrap_or_default()),
            refunds_json: None,
            subtotal: None,
            discount_total: Some(discount_total),
            grand_total: Some(grand_total),
            paid_total: None,
            change_total: None,
            payment_status: None,
            customer_id: None,
            customer_name: None,
            notes: None,
            source: None,
        };

        PosOrderRepo::update_fields(&self.db, &update).await?;

        self.log_audit(cafe_id, &NewAuditEntry {
            action: "apply_discount".into(),
            entity_type: "order".into(),
            entity_id: Some(order_id.into()),
            staff_id: staff_id.map(|s| s.to_string()),
            details_json: Some(format!(r#"{{"name":"{}","type":"{}","value":{},"amount":{}}}"#, discount.name, discount.discount_type, discount.value, amount)),
        }).await?;

        let updated = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&updated))
    }

    pub async fn remove_discount(&self, cafe_id: &str, order_id: &str, discount_id: &str) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        let mut discounts: Vec<DiscountRecord> = serde_json::from_str(&order.discounts_json).unwrap_or_default();
        discounts.retain(|d| d.id != discount_id);

        let items: Vec<OrderItem> = serde_json::from_str(&order.items_json).unwrap_or_default();
        let subtotal: i64 = items.iter().map(|i| i.subtotal).sum();
        let discount_total: i64 = discounts.iter().map(|d| d.amount).sum();
        let grand_total = (subtotal - discount_total).max(0);

        let update = UpdatePosOrder {
            id: order_id.to_string(),
            cafe_id: cafe_id.to_string(),
            version: order.version,
            status: None,
            items_json: None,
            payments_json: None,
            discounts_json: Some(serde_json::to_string(&discounts).unwrap_or_default()),
            refunds_json: None,
            subtotal: None,
            discount_total: Some(discount_total),
            grand_total: Some(grand_total),
            paid_total: None,
            change_total: None,
            payment_status: None,
            customer_id: None,
            customer_name: None,
            notes: None,
            source: None,
        };

        PosOrderRepo::update_fields(&self.db, &update).await?;

        let updated = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&updated))
    }

    // ─── Cancel ────────────────────────────────────────────────

    pub async fn cancel_order(&self, cafe_id: &str, order_id: &str, reason: &str, staff_id: Option<&str>) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        let update = UpdatePosOrder {
            id: order_id.to_string(),
            cafe_id: cafe_id.to_string(),
            version: order.version,
            status: Some("cancelled".into()),
            items_json: None,
            payments_json: None,
            discounts_json: None,
            refunds_json: None,
            subtotal: None,
            discount_total: None,
            grand_total: None,
            paid_total: None,
            change_total: None,
            payment_status: None,
            customer_id: None,
            customer_name: None,
            notes: Some(reason.to_string()),
            source: None,
        };
        PosOrderRepo::update_fields(&self.db, &update).await?;

        self.log_audit(cafe_id, &NewAuditEntry {
            action: "cancel_order".into(),
            entity_type: "order".into(),
            entity_id: Some(order_id.into()),
            staff_id: staff_id.map(|s| s.to_string()),
            details_json: Some(format!(r#"{{"reason":"{}"}}"#, reason)),
        }).await?;

        let updated = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&updated))
    }

    // ─── Refund ────────────────────────────────────────────────

    pub async fn process_refund(&self, cafe_id: &str, order_id: &str, refund: &RefundInput) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        if order.status == "refunded" {
            return Err(DbError::Validation("Order already refunded".into()));
        }

        let mut refunds: Vec<RefundRecord> = serde_json::from_str(&order.refunds_json).unwrap_or_default();
        refunds.push(RefundRecord {
            id: new_id(),
            amount: refund.amount,
            reason: refund.reason.clone(),
            item_ids: refund.item_ids.clone(),
            created_by: refund.staff_id.clone(),
            created_at: now(),
        });

        let total_refunded: i64 = refunds.iter().map(|r| r.amount).sum();
        let new_paid = (order.paid_total - refund.amount).max(0);

        let update = UpdatePosOrder {
            id: order_id.to_string(),
            cafe_id: cafe_id.to_string(),
            version: order.version,
            status: Some(if total_refunded >= order.grand_total { "refunded".into() } else { "partially_refunded".into() }),
            items_json: None,
            payments_json: None,
            discounts_json: None,
            refunds_json: Some(serde_json::to_string(&refunds).unwrap_or_default()),
            subtotal: None,
            discount_total: None,
            grand_total: None,
            paid_total: Some(new_paid),
            change_total: None,
            payment_status: Some(if new_paid <= 0 { "unpaid".to_string() } else if new_paid < order.grand_total { "partial".to_string() } else { "paid".to_string() }),
            customer_id: None,
            customer_name: None,
            notes: None,
            source: None,
        };
        PosOrderRepo::update_fields(&self.db, &update).await?;

        self.log_audit(cafe_id, &NewAuditEntry {
            action: "refund_order".into(),
            entity_type: "order".into(),
            entity_id: Some(order_id.into()),
            staff_id: refund.staff_id.clone(),
            details_json: Some(format!(r#"{{"amount":{},"reason":"{}"}}"#, refund.amount, refund.reason)),
        }).await?;

        let updated = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&updated))
    }

    // ─── Inventory & Recipe Deduction ──────────────────────────

    async fn deduct_inventory(&self, cafe_id: &str, items: &[OrderItem]) -> DbResult<()> {
        for item in items {
            let inv_items = InventoryRepo::find_by_name(&self.db, cafe_id, &item.product_name).await?;
            for inv in inv_items {
                let qty = item.quantity;
                let prev_qty = inv.current_qty;
                let new_qty = prev_qty - qty;
                InventoryRepo::update_qty(&self.db, &inv.id, cafe_id, new_qty).await?;

                StockMovementRepo::insert(&self.db, cafe_id, None, &NewStockMovement {
                    inventory_item_id: inv.id.clone(),
                    quantity: -qty,
                    previous_qty: prev_qty,
                    new_qty,
                    movement_type: "OUT".into(),
                    reference_type: Some("pos_order".into()),
                    reference_id: None,
                    notes: Some(format!("POS sale: {}", item.product_name)),
                    cost_per_unit: Some(inv.cost_per_unit),
                    total_cost: Some((inv.cost_per_unit as f64 * qty) as i64),
                }).await?;
            }
        }
        Ok(())
    }

    async fn consume_recipes(&self, cafe_id: &str, items: &[OrderItem]) -> DbResult<()> {
        for item in items {
            let recipes = RecipeRepo::find_by_product_name(&self.db, cafe_id, &item.product_name).await?;
            for recipe in recipes {
                let consumed = recipe.quantity * item.quantity;
                let inv_item = InventoryRepo::find_by_id(&self.db, &recipe.ingredient_id, cafe_id).await?;
                if let Some(inv) = inv_item {
                    let new_qty = inv.current_qty - consumed;
                    InventoryRepo::update_qty(&self.db, &inv.id, cafe_id, new_qty).await?;

                    StockMovementRepo::insert(&self.db, cafe_id, None, &NewStockMovement {
                        inventory_item_id: inv.id.clone(),
                        quantity: -consumed,
                        previous_qty: inv.current_qty,
                        new_qty,
                        movement_type: "OUT".into(),
                        reference_type: Some("recipe_consumption".into()),
                        reference_id: None,
                        notes: Some(format!("Recipe consumed for: {}", item.product_name)),
                        cost_per_unit: Some(inv.cost_per_unit),
                        total_cost: Some((inv.cost_per_unit as f64 * consumed) as i64),
                    }).await?;
                }
            }
        }
        Ok(())
    }

    // ─── Audit ─────────────────────────────────────────────────

    pub async fn log_audit(&self, cafe_id: &str, entry: &NewAuditEntry) -> DbResult<String> {
        PosAuditRepo::insert(&self.db, cafe_id, entry).await
    }

    pub async fn get_audit_log(&self, cafe_id: &str, since: Option<&str>, action: Option<&str>) -> DbResult<Vec<crate::db::pos_audit::AuditLogEntry>> {
        PosAuditRepo::find_all(&self.db, cafe_id, since, action).await
    }

    // ─── Printing ──────────────────────────────────────────────

    pub async fn print_receipt(&self, cafe_id: &str, order_id: &str) -> DbResult<String> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;

        let printer = PosPrinterRepo::find_default(&self.db, cafe_id)
            .await?
            .unwrap_or(Printer {
                id: String::new(),
                cafe_id: cafe_id.to_string(),
                name: "Default".into(),
                printer_type: "file".into(),
                interface: "file".into(),
                address: None,
                port: None,
                paper_width: 80,
                chars_per_line: 42,
                active: 1,
                is_default: 1,
                created_at: now(),
            });

        let items: Vec<OrderItem> = serde_json::from_str(&order.items_json).unwrap_or_default();
        let mut receipt = String::new();
        let line_len = printer.chars_per_line as usize;

        receipt.push_str(&format!("{:^w$}\n", "SONIC POS", w = line_len));
        receipt.push_str(&format!("{:^w$}\n", "================", w = line_len));
        receipt.push_str(&format!("Order #{} \n", order.order_number));
        receipt.push_str(&format!("{}\n", order.created_at));
        receipt.push_str(&format!("{:->w$}\n", "", w = line_len));

        for item in &items {
            let line = format!("{:.1}x {}  {:>8}", item.quantity, item.product_name, format_egp(item.subtotal));
            receipt.push_str(&line);
            receipt.push('\n');
            for m in &item.modifiers {
                receipt.push_str(&format!("    + {}  {:>8}\n", m.option_name, format_egp(m.price_adjustment)));
            }
        }

        receipt.push_str(&format!("{:->w$}\n", "", w = line_len));
        if order.discount_total > 0 {
            receipt.push_str(&format!("{:>w$}\n", format!("Discount: -{}", format_egp(order.discount_total)), w = line_len));
        }
        receipt.push_str(&format!("{:>w$}\n", format!("Total: {}", format_egp(order.grand_total)), w = line_len));
        receipt.push_str(&format!("{:>w$}\n", format!("Paid: {}", format_egp(order.paid_total)), w = line_len));
        if order.change_total > 0 {
            receipt.push_str(&format!("{:>w$}\n", format!("Change: {}", format_egp(order.change_total)), w = line_len));
        }
        receipt.push('\n');
        receipt.push_str(&format!("{:^w$}\n", "Thank you!", w = line_len));
        receipt.push_str(&format!("{:^w$}\n", "================", w = line_len));

        match printer.interface.as_str() {
            "file" => {
                let path = std::env::temp_dir().join(format!("receipt_{}.txt", order_id));
                std::fs::write(&path, &receipt).ok();
                Ok(format!("Receipt written to {:?}", path))
            }
            _ => Ok(receipt),
        }
    }

    pub async fn open_cash_drawer(&self, cafe_id: &str) -> DbResult<String> {
        let _printer = PosPrinterRepo::find_default(&self.db, cafe_id).await?;
        Ok("Cash drawer opened (simulated)".into())
    }

    // ─── Printer Config ────────────────────────────────────────

    pub async fn get_printers(&self, cafe_id: &str) -> DbResult<Vec<Printer>> {
        PosPrinterRepo::find_all(&self.db, cafe_id).await
    }

    pub async fn save_printer(&self, cafe_id: &str, input: &PrinterInput) -> DbResult<String> {
        PosPrinterRepo::insert(&self.db, cafe_id, input).await
    }

    pub async fn delete_printer(&self, cafe_id: &str, printer_id: &str) -> DbResult<()> {
        PosPrinterRepo::delete(&self.db, printer_id, cafe_id).await
    }

    // ─── Sales Summary ─────────────────────────────────────────

    pub async fn get_sales_summary(&self, cafe_id: &str) -> DbResult<SalesSummary> {
        let today = now()["0".len()..10].to_string();
        let (total_orders, total_revenue, total_paid) = PosOrderRepo::get_sales_summary(&self.db, cafe_id, &today, &today).await?;
        let avg = if total_orders > 0 { total_revenue as f64 / total_orders as f64 } else { 0.0 };
        Ok(SalesSummary { total_orders, total_revenue, total_paid, avg_order_value: avg })
    }

    // ─── Helpers ───────────────────────────────────────────────

    fn calculate_discount_total(&self, discounts: &[DiscountInput], subtotal: i64) -> i64 {
        discounts.iter().map(|d| {
            if d.discount_type == "percentage" {
                (subtotal as f64 * d.value as f64 / 100.0) as i64
            } else {
                d.value.min(subtotal)
            }
        }).sum()
    }

    async fn get_order_internal(&self, cafe_id: &str, order_id: &str) -> DbResult<POSOrder> {
        let order = PosOrderRepo::find_by_id(&self.db, order_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("PosOrder not found: {}", order_id)))?;
        Ok(self.db_order_to_pos(&order))
    }

    fn db_order_to_pos(&self, order: &crate::db::pos_order::PosOrder) -> POSOrder {
        let items: Vec<OrderItem> = serde_json::from_str(&order.items_json).unwrap_or_default();
        let payments: Vec<PaymentRecord> = serde_json::from_str(&order.payments_json).unwrap_or_default();
        let discounts: Vec<DiscountRecord> = serde_json::from_str(&order.discounts_json).unwrap_or_default();
        let refunds: Vec<RefundRecord> = serde_json::from_str(&order.refunds_json).unwrap_or_default();

        POSOrder {
            id: order.id.clone(),
            cafe_id: order.cafe_id.clone(),
            order_number: order.order_number,
            status: order.status.clone(),
            items,
            payments,
            discounts,
            refunds,
            subtotal: order.subtotal,
            discount_total: order.discount_total,
            grand_total: order.grand_total,
            paid_total: order.paid_total,
            change_total: order.change_total,
            payment_status: order.payment_status.clone(),
            customer_id: order.customer_id.clone(),
            customer_name: order.customer_name.clone(),
            customer_phone: order.customer_phone.clone(),
            notes: order.notes.clone(),
            source: order.source.clone(),
            created_by: order.created_by.clone(),
            created_at: order.created_at.clone(),
        }
    }
}

fn format_egp(amount: i64) -> String {
    let piasters = amount % 100;
    let pounds = amount / 100;
    format!("{}.{:02} EGP", pounds, piasters.abs())
}
