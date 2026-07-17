'use client';

import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import Link from 'next/link';

export function DebtOverview() {
  const totalDebt = useAppStore((s) => s.totalCustomerDebt);
  const debts = useAppStore((s) => s.customerDebts);
  const customerDebtSummary = useAppStore((s) => s.customerDebtSummary);
  const unifiedDebtOverview = useAppStore((s) => s.unifiedDebtOverview);

  const totalUnpaid = unifiedDebtOverview?.totalUnpaidDebt
    ?? customerDebtSummary?.totalUnpaid
    ?? totalDebt;

  const unsettledCount = debts.filter((d) => !d.settled).length;
  const customerCount = unifiedDebtOverview?.uniqueCustomerCount
    ?? customerDebtSummary?.customerCount
    ?? unsettledCount;

  return (
    <Link href="/owner/debts" className="block transition-all hover:opacity-90">
      <Card
        title="إجمالي ديون العملاء"
        value={formatCurrency(totalUnpaid)}
        icon={<Wallet className="h-5 w-5" />}
        subtitle={`${customerCount} عميل مع ديون مستحقة ←`}
      />
    </Link>
  );
}