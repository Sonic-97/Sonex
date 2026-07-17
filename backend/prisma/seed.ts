import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing data...');

  // Delete in order to respect foreign keys
  await prisma.aILog.deleteMany();
  await prisma.fraudAlert.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.whatsappCustomer.deleteMany();
  await prisma.inventorySyncLog.deleteMany();
  await prisma.inventoryPurchase.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.analyticsCache.deleteMany();
  await prisma.reportJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.driverCashSettlement.deleteMany();
  await prisma.suggestionFeedback.deleteMany();
  await prisma.suggestion.deleteMany();
  await prisma.customerHabit.deleteMany();
  await prisma.staffPurchase.deleteMany();
  await prisma.priceOverride.deleteMany();
  await prisma.inCafeOrderItem.deleteMany();
  await prisma.inCafeOrder.deleteMany();
  await prisma.queueJobLog.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.staffPerformance.deleteMany();
  await prisma.staffEarning.deleteMany();
  await prisma.driverEarning.deleteMany();
  await prisma.dailyRevenue.deleteMany();
  await prisma.paymentLog.deleteMany();
  await prisma.employeePayment.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.whatsAppLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.priceChangeLog.deleteMany();
  await prisma.branchProduct.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.inventoryConsumption.deleteMany();
  await prisma.stockLedger.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.playStationSession.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.cashHandover.deleteMany();
  await prisma.financialTransaction.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.cafe.deleteMany();

  console.log('All test data cleared.\n');

  console.log('Creating default cafe and branch...');

  const ownerPassword = await bcrypt.hash('01639', 10);
  const defaultCafe = await prisma.cafe.upsert({
    where: { ownerCode: 'Sonic123456' },
    update: { ownerPassword, name: 'Sonic Coffee', phone: '01000000000', active: true, cafeCode: 'COF-12345', category: 'Coffee Shop' },
    create: {
      name: 'Sonic Coffee',
      ownerCode: 'Sonic123456',
      ownerPassword,
      phone: '01000000000',
      active: true,
      cafeCode: 'COF-12345',
      category: 'Coffee Shop',
    },
  });
  const cafeId = defaultCafe.id;

  const defaultBranch = await prisma.branch.upsert({
    where: { cafeId_slug: { cafeId, slug: 'main-branch' } },
    update: { name: 'Main Branch', active: true },
    create: { name: 'Main Branch', slug: 'main-branch', cafeId, active: true },
  });

  // Create the specific owner user account
  const ownerStaff = await prisma.staff.upsert({
    where: { loginCode: 'SONIC1' },
    update: { name: 'Owner', email: 'owner@sonic.com' },
    create: {
      name: 'Owner',
      email: 'owner@sonic.com',
      role: 'OWNER',
      phone: '01000000000',
      loginCode: 'SONIC1',
      password: ownerPassword,
      pinHash: '',
      branchId: defaultBranch.id,
      cafeId: cafeId,
    },
  });

  // Link Cafe to owner ID
  await prisma.cafe.update({
    where: { id: cafeId },
    data: { ownerId: ownerStaff.id },
  });

  // Create default product categories
  const hotDrinksCategory = await prisma.productCategory.create({
    data: { name: 'مشروبات ساخنة', icon: '☕', color: '#ea580c', sortOrder: 1, cafeId, branchId: defaultBranch.id },
  });
  const coldDrinksCategory = await prisma.productCategory.create({
    data: { name: 'مشروبات باردة', icon: '🥤', color: '#0891b2', sortOrder: 2, cafeId, branchId: defaultBranch.id },
  });
  const freshJuicesCategory = await prisma.productCategory.create({
    data: { name: 'عصائر طبيعية', icon: '🍹', color: '#65a30d', sortOrder: 3, cafeId, branchId: defaultBranch.id },
  });
  const dessertsCategory = await prisma.productCategory.create({
    data: { name: 'حلويات', icon: '🍰', color: '#db2777', sortOrder: 4, cafeId, branchId: defaultBranch.id },
  });
  const foodCategory = await prisma.productCategory.create({
    data: { name: 'مأكولات', icon: '🍔', color: '#dc2626', sortOrder: 5, cafeId, branchId: defaultBranch.id },
  });

  // Create inventory items
  const inventoryBeans = await prisma.inventory.create({
    data: {
      itemName: 'بن قهوة',
      unit: 'kg',
      currentQty: 100,
      minThreshold: 10,
      costPerUnit: 5.0,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const inventoryMilk = await prisma.inventory.create({
    data: {
      itemName: 'حليب',
      unit: 'L',
      currentQty: 200,
      minThreshold: 20,
      costPerUnit: 2.0,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const inventorySugar = await prisma.inventory.create({
    data: {
      itemName: 'سكر',
      unit: 'kg',
      currentQty: 50,
      minThreshold: 5,
      costPerUnit: 3.0,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  // Create products
  const productCoffee = await prisma.product.create({
    data: {
      name: 'قهوة عربية',
      category: 'مشروبات ساخنة',
      categoryId: hotDrinksCategory.id,
      price: 15.0,
      cost: 5.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const productLatte = await prisma.product.create({
    data: {
      name: 'لاتيه',
      category: 'مشروبات ساخنة',
      categoryId: hotDrinksCategory.id,
      price: 20.0,
      cost: 7.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const productColdBrew = await prisma.product.create({
    data: {
      name: 'كولد برو',
      category: 'مشروبات باردة',
      categoryId: coldDrinksCategory.id,
      price: 25.0,
      cost: 8.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const productOrangeJuice = await prisma.product.create({
    data: {
      name: 'عصير برتقال طبيعي',
      category: 'عصائر طبيعية',
      categoryId: freshJuicesCategory.id,
      price: 22.0,
      cost: 10.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const productCake = await prisma.product.create({
    data: {
      name: 'كيك شوكولاتة',
      category: 'حلويات',
      categoryId: dessertsCategory.id,
      price: 30.0,
      cost: 12.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  const productBurger = await prisma.product.create({
    data: {
      name: 'برجر لحم',
      category: 'مأكولات',
      categoryId: foodCategory.id,
      price: 45.0,
      cost: 20.0,
      active: true,
      cafeId,
      branchId: defaultBranch.id,
    },
  });

  // Create recipe ingredients
  await prisma.recipeIngredient.createMany({
    data: [
      {
        cafeId,
        productId: productCoffee.id,
        inventoryId: inventoryBeans.id,
        quantity: 0.02,
        unit: 'kg',
      },
      {
        cafeId,
        productId: productLatte.id,
        inventoryId: inventoryBeans.id,
        quantity: 0.02,
        unit: 'kg',
      },
      {
        cafeId,
        productId: productLatte.id,
        inventoryId: inventoryMilk.id,
        quantity: 0.2,
        unit: 'L',
      },
      {
        cafeId,
        productId: productColdBrew.id,
        inventoryId: inventoryBeans.id,
        quantity: 0.03,
        unit: 'kg',
      },
      {
        cafeId,
        productId: productOrangeJuice.id,
        inventoryId: inventorySugar.id,
        quantity: 0.01,
        unit: 'kg',
      },
      {
        cafeId,
        productId: productCake.id,
        inventoryId: inventoryMilk.id,
        quantity: 0.1,
        unit: 'L',
      },
      {
        cafeId,
        productId: productCake.id,
        inventoryId: inventorySugar.id,
        quantity: 0.05,
        unit: 'kg',
      },
      {
        cafeId,
        productId: productBurger.id,
        inventoryId: inventoryBeans.id,
        quantity: 0.01,
        unit: 'kg',
      },
    ],
  });

  console.log(`Cafe created: ${defaultCafe.name} (${defaultCafe.ownerCode})`);
  console.log(`Owner created: SONIC1`);
  console.log(`Branch created: ${defaultBranch.name}`);
  console.log(`Categories created: 5 (with emojis)`);
  console.log(`Products created: 6`);
  console.log(`Inventory items created: 3`);
  console.log(`Recipe ingredients linked: 8`);

  const superAdminPassword = await bcrypt.hash('admin123', 10);
  await prisma.superAdmin.upsert({
    where: { username: 'admin' },
    update: { password: superAdminPassword },
    create: {
      username: 'admin',
      password: superAdminPassword,
    },
  });
  console.log('Super Admin created: admin / admin123');
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
