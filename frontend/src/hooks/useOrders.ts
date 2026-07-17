'use client';

import { useEffect, useState } from 'react';
import {
  fetchOwnerDashboard,
  fetchStaff,
  fetchDrivers,
  fetchBaristaQueue,
  fetchOrdersByStatus,
  fetchFinancialSnapshot,
  fetchAnalyticsOverview,
  fetchStaffPerformanceOverview,
  fetchDailyRanking,
  fetchAiDecisions,
  fetchInCafeOrders,
  fetchStaffPurchases,
  fetchSuggestions,
  fetchSuggestionStats,
  fetchReconciliation,
  fetchDebts,
} from '@/lib/api';
import { useAppStore } from '@/store';
import { Order, OwnerDashboardData, FinancialSnapshot, AnalyticsOverview, StaffPerformanceOverview, PerformanceRanking, Decision, InCafeOrder, StaffPurchase, Suggestion, WeeklySuggestionStats, ReconciliationSummary, DebtRecord } from '@/types';

export function useInitialLoad(role: 'owner' | 'barista' | 'driver') {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const store = useAppStore.getState();
        if (role === 'owner') {
          const [dashboard, staff, drivers, financial, analytics, perfOverview, ranking, decisions, cafeOrders, purchases, suggestions, sugStats] = await Promise.all([
            fetchOwnerDashboard(),
            fetchStaff(),
            fetchDrivers(),
            fetchFinancialSnapshot(),
            fetchAnalyticsOverview(),
            fetchStaffPerformanceOverview(),
            fetchDailyRanking(),
            fetchAiDecisions(10),
            fetchInCafeOrders(),
            fetchStaffPurchases(),
            fetchSuggestions('active', 50),
            fetchSuggestionStats(),
          ]);
          store.setOwnerDashboard(dashboard as OwnerDashboardData);
          store.setFinancialSnapshot(financial as FinancialSnapshot);
          store.setAnalyticsOverview(analytics as AnalyticsOverview);
          store.setStaffPerformanceData(perfOverview as StaffPerformanceOverview);
          store.setDailyRanking(ranking as PerformanceRanking[]);
          store.setDecisions(decisions as Decision[]);
          store.setStaffList(staff as any[]);
          store.setDriverList(drivers as any[]);
          store.setInCafeOrders(cafeOrders as InCafeOrder[]);
          store.setStaffPurchases(purchases as StaffPurchase[]);
          store.setSuggestions((suggestions as any).suggestions ?? (suggestions as Suggestion[]));
          store.setSuggestionStats(sugStats as WeeklySuggestionStats);

          const [reconciliation, debts] = await Promise.all([
            fetchReconciliation(),
            fetchDebts(false),
          ]);
          store.setReconciliation(reconciliation as ReconciliationSummary);
          store.setDebtRecords(debts as DebtRecord[]);
        } else if (role === 'barista') {
          const [queue, cafeOrders] = await Promise.all([
            fetchBaristaQueue(),
            fetchInCafeOrders(),
          ]);
          store.setOrders(queue as Order[]);
          store.setInCafeOrders(cafeOrders as InCafeOrder[]);
        } else if (role === 'driver') {
          const [readyOrders, drivers] = await Promise.all([
            fetchOrdersByStatus('READY'),
            fetchDrivers(),
          ]);
          store.setOrders(readyOrders as Order[]);
          store.setDriverList(drivers as any[]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [role]);

  return { loading, error };
}
