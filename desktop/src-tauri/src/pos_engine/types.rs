use serde::{Deserialize, Serialize};

/// POS order item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub unit_price: i64,
    pub discount_amount: i64,
    pub subtotal: i64,
    pub modifiers: Vec<AppliedModifier>,
    pub notes: Option<String>,
}

/// Modifier applied to an item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedModifier {
    pub group_id: Option<String>,
    pub option_id: Option<String>,
    pub option_name: String,
    pub price_adjustment: i64,
}

/// Payment input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentInput {
    pub method: String,
    pub amount: i64,
    pub reference: Option<String>,
}

/// Payment on an order
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRecord {
    pub id: String,
    pub method: String,
    pub amount: i64,
    pub reference: Option<String>,
    pub created_at: String,
}

/// Discount input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountInput {
    pub name: String,
    pub discount_type: String,
    pub value: i64,
    pub item_id: Option<String>,
}

/// Applied discount
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountRecord {
    pub id: String,
    pub name: String,
    pub discount_type: String,
    pub value: i64,
    pub amount: i64,
    pub item_id: Option<String>,
}

/// Refund input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefundInput {
    pub amount: i64,
    pub reason: String,
    pub item_ids: Option<Vec<String>>,
    pub staff_id: Option<String>,
}

/// Refund record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefundRecord {
    pub id: String,
    pub amount: i64,
    pub reason: String,
    pub item_ids: Option<Vec<String>>,
    pub created_by: Option<String>,
    pub created_at: String,
}

/// Create order request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePOSOrder {
    pub items: Vec<OrderItem>,
    pub payments: Vec<PaymentInput>,
    pub discounts: Vec<DiscountInput>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub notes: Option<String>,
    pub source: Option<String>,
    pub created_by: Option<String>,
}

/// Full POS order response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct POSOrder {
    pub id: String,
    pub cafe_id: String,
    pub order_number: i64,
    pub status: String,
    pub items: Vec<OrderItem>,
    pub payments: Vec<PaymentRecord>,
    pub discounts: Vec<DiscountRecord>,
    pub refunds: Vec<RefundRecord>,
    pub subtotal: i64,
    pub discount_total: i64,
    pub grand_total: i64,
    pub paid_total: i64,
    pub change_total: i64,
    pub payment_status: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub notes: Option<String>,
    pub source: String,
    pub created_by: Option<String>,
    pub created_at: String,
}

/// Product search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSearchResult {
    pub id: String,
    pub name: String,
    pub price: i64,
    pub barcode: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub active: bool,
    pub has_modifiers: bool,
}

/// Category with products for POS browsing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryWithProducts {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    pub products: Vec<ProductSearchResult>,
}

/// Sales summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesSummary {
    pub total_orders: i64,
    pub total_revenue: i64,
    pub total_paid: i64,
    pub avg_order_value: f64,
}

/// Modifier group with options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifierGroupWithOptions {
    pub group_id: String,
    pub group_name: String,
    pub min_select: i64,
    pub max_select: i64,
    pub required: bool,
    pub options: Vec<ModifierOptionView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifierOptionView {
    pub id: String,
    pub name: String,
    pub price_adjustment: i64,
    pub selected: bool,
}
