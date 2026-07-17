'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { FileText, Download, Search } from 'lucide-react';

interface OrderRow {
  id: string;
  code: string;
  sourceType?: string;
  employee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  customer?: { id: string; name?: string | null; phone: string } | null;
  status: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
}

export default function ReportsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/staff').then(r => setEmployees(r.data)),
      api.get('/customers').then(r => setCustomers(r.data)),
    ]).catch(() => {});
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (sourceType) params.set('sourceType', sourceType);
      if (employeeId) params.set('employeeId', employeeId);
      if (customerId) params.set('customerId', customerId);
      if (status) params.set('status', status);
      const { data } = await api.get(`/orders?${params}`);
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, sourceType, employeeId, customerId, status]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const sourceLabels: Record<string, string> = {
    INSIDE_CAFE: 'داخل الكافيه',
    OUTSIDE_CAFE: 'خارج الكافيه',
    WHATSAPP_ORDER: 'طلب واتساب',
  };

  const statusLabels: Record<string, string> = {
    NEW: 'جديد', CONFIRMED: 'مؤكد', READY: 'جاهز',
    PICKED_UP: 'تم الاستلام', DELIVERED: 'تم التوصيل',
    PAID: 'مدفوع', CLOSED: 'مغلق', CANCELLED: 'ملغي',
  };

  const filteredCustomers = customers.filter(c =>
    (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  );

  const totals = orders.reduce((acc, o) => ({
    count: acc.count + 1,
    revenue: acc.revenue + Number(o.total),
    paid: acc.paid + (o.paymentStatus === 'PAID' ? Number(o.total) : 0),
  }), { count: 0, revenue: 0, paid: 0 });

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <FileText className="h-6 w-6 text-violet-600" />
        <h1 className="text-2xl font-bold text-gray-800">التقارير</h1>
      </div>

      <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">مصدر الطلب</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">الكل</option>
              <option value="INSIDE_CAFE">داخل الكافيه</option>
              <option value="OUTSIDE_CAFE">خارج الكافيه</option>
              <option value="WHATSAPP_ORDER">طلب واتساب</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">الموظف</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">الكل</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">حالة الطلب</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">الكل</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">العميل</label>
            <input type="text" placeholder="بحث..." value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
            {customerSearch && filteredCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-32 overflow-y-auto rounded-lg border bg-white shadow-lg">
                {filteredCustomers.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name || c.phone); }}
                    className="block w-full px-3 py-1.5 text-right text-sm hover:bg-gray-100">
                    {c.name || '—'} ({c.phone})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadReports}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            تطبيق الفلاتر
          </button>
          <button onClick={() => { setDateFrom(''); setDateTo(''); setSourceType(''); setEmployeeId(''); setStatus(''); setCustomerId(''); setCustomerSearch(''); }}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            إعادة تعيين
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">إجمالي الطلبات</p>
          <p className="text-2xl font-bold text-gray-800">{totals.count}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">إجمالي الإيرادات</p>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totals.revenue)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">الإيرادات المدفوعة</p>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totals.paid)}</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">جاري التحميل...</div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-gray-400">لا توجد طلبات تطابق الفلاتر</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">الكود</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">العميل</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">المصدر</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">الموظف</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">المبلغ</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-violet-600">{o.code}</td>
                  <td className="px-4 py-3 text-gray-800">{o.customer?.name || o.customer?.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {sourceLabels[o.sourceType || ''] || o.sourceType || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.employee?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      o.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                      o.status === 'PAID' || o.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{formatCurrency(Number(o.total))}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.createdAt).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
