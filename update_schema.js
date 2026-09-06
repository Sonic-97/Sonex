const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'backend', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Add relations to Cafe model
const cafeTarget = '  deliveryZones          DeliveryZone[]';
const cafeAddition = '  deliveryZones          DeliveryZone[]\n  aiConfig               CafeAiConfig?\n  promotions             CafePromotion[]';

if (!schema.includes('aiConfig               CafeAiConfig?')) {
  schema = schema.replace(cafeTarget, cafeAddition);
  console.log('Added aiConfig and promotions to Cafe model');
}

// 2. Add snapshotted fields to OrderItem
const itemTarget = '  selectedOptions Json    @default("[]") @map("selected_options")';
const itemAddition = '  selectedOptions Json    @default("[]") @map("selected_options")\n  productNameSnapshot String? @map("product_name_snapshot")\n  variantNameSnapshot String? @map("variant_name_snapshot")\n  addonPricesSnapshot Json    @default("[]") @map("addon_prices_snapshot")';

if (!schema.includes('productNameSnapshot')) {
  schema = schema.replace(itemTarget, itemAddition);
  console.log('Added snapshot fields to OrderItem');
}

// 3. Append CafeAiConfig and CafePromotion models at the end
const modelsToAdd = `
model CafeAiConfig {
  id                      String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  cafeId                  String   @unique @map("cafe_id")
  botName                 String   @default("مساعد سونيك الذكي") @map("bot_name")
  tone                    String   @default("EGYPTIAN_CASUAL") // EGYPTIAN_CASUAL, PROFESSIONAL, FAST_CONCISE
  welcomeMessage          String?  @map("welcome_message")
  customInstructions     String?  @map("custom_instructions") // strictly bounded, cannot override truth
  deliveryNotes           String?  @map("delivery_notes")
  openingHoursNotes       String?  @map("opening_hours_notes")
  enableRecommendations   Boolean  @default(true) @map("enable_recommendations")
  maxUpsellsPerSession    Int      @default(1) @map("max_upsells_per_session")
  configVersion           Int      @default(1) @map("config_version")
  createdAt               DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt               DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  cafe                    Cafe     @relation(fields: [cafeId], references: [id], onDelete: Cascade)

  @@map("cafe_ai_configs")
}

model CafePromotion {
  id               String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  cafeId           String    @map("cafe_id")
  name             String
  description      String?
  discountType     String    @default("PERCENTAGE") @map("discount_type") // PERCENTAGE, FIXED_AMOUNT, FREE_ITEM
  discountValue    Decimal   @default(0) @db.Decimal(10, 2) @map("discount_value")
  eligibleProductIds Json    @default("[]") @map("eligible_product_ids")
  freeProductId    String?   @map("free_product_id")
  minimumOrder     Decimal   @default(0) @db.Decimal(10, 2) @map("minimum_order")
  startAt          DateTime  @default(now()) @db.Timestamptz(6) @map("start_at")
  endAt            DateTime? @db.Timestamptz(6) @map("end_at")
  enabled          Boolean   @default(true)
  usageLimit       Int?      @map("usage_limit")
  usedCount        Int       @default(0) @map("used_count")
  createdAt        DateTime  @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt        DateTime  @updatedAt @db.Timestamptz(6) @map("updated_at")

  cafe             Cafe      @relation(fields: [cafeId], references: [id], onDelete: Cascade)

  @@index([cafeId, enabled])
  @@index([cafeId, startAt, endAt])
  @@map("cafe_promotions")
}
`;

if (!schema.includes('model CafeAiConfig')) {
  schema = schema.trimEnd() + '\n' + modelsToAdd;
  console.log('Added CafeAiConfig and CafePromotion models');
}

fs.writeFileSync(schemaPath, schema);
console.log('SCHEMA UPDATE COMPLETE');
