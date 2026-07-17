'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Clock, Calendar, AlertCircle, DollarSign, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface AttendanceRecord {
  id: string;
  staffId: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  date: string;
  status: string;
  staff: {
    name: string;
    role: string;
    salaryType: string;
    salary: string | number;
    hourlyWage: string | number;
  };
}

export default function OwnerAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const { data } = await api.get('/staff/attendance/all');
        setRecords(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Group by employee to calculate aggregated stats
  const employeeStats = records.reduce((acc, curr) => {
    if (!acc[curr.staffId]) {
      acc[curr.staffId] = {
        name: curr.staff.name,
        role: curr.staff.role,
        salaryType: curr.staff.salaryType,
        salary: Number(curr.staff.salary),
        hourlyWage: Number(curr.staff.hourlyWage),
        totalHours: 0,
        attendanceDays: 0,
        lateArrivals: 0,
        totalCost: 0,
      };
    }

    const stats = acc[curr.staffId];
    stats.attendanceDays += 1;
    
    // Late arrival heuristic: Clock In after 10:00 AM local time
    const clockInDate = new Date(curr.clockIn);
    if (clockInDate.getHours() >= 10) {
      stats.lateArrivals += 1;
    }

    if (curr.totalHours) {
      stats.totalHours += curr.totalHours;
      
      // Calculate Cost
      if (curr.staff.salaryType === 'HOURLY') {
        stats.totalCost += curr.totalHours * Number(curr.staff.hourlyWage);
      } else if (curr.staff.salaryType === 'DAILY') {
        stats.totalCost += Number(curr.staff.salary);
      } else {
        // Monthly - approximate daily cost
        stats.totalCost += (Number(curr.staff.salary) / 30);
      }
    } else if (curr.status === 'ACTIVE') {
      // If currently active and DAILY or MONTHLY, still count the base cost for today
      if (curr.staff.salaryType === 'DAILY') {
        stats.totalCost += Number(curr.staff.salary);
      } else if (curr.staff.salaryType === 'MONTHLY') {
        stats.totalCost += (Number(curr.staff.salary) / 30);
      }
    }

    return acc;
  }, {} as Record<string, any>);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">سجل الحضور والإنصراف</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.values(employeeStats).map((stat: any) => (
          <div key={stat.name} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-bold text-gray-800 text-lg">{stat.name}</h3>
            <p className="text-xs text-gray-500 mb-4">{stat.role === 'BARISTA' ? 'باريستا' : 'سائق'}</p>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600"><Calendar className="h-4 w-4" /> أيام الحضور</span>
                <span className="font-semibold text-gray-900">{stat.attendanceDays} يوم</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600"><Clock className="h-4 w-4" /> إجمالي الساعات</span>
                <span className="font-semibold text-gray-900">{stat.totalHours.toFixed(1)} ساعة</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600"><AlertCircle className="h-4 w-4 text-amber-500" /> تأخيرات</span>
                <span className="font-semibold text-gray-900">{stat.lateArrivals}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1.5 text-gray-600"><DollarSign className="h-4 w-4 text-emerald-500" /> التكلفة الكلية</span>
                <span className="font-bold text-emerald-600">{formatCurrency(stat.totalCost)}</span>
              </div>
            </div>
          </div>
        ))}
        {Object.keys(employeeStats).length === 0 && (
          <div className="col-span-full p-6 text-center text-gray-500 bg-white rounded-xl border">لا توجد إحصائيات حضور لعرضها.</div>
        )}
      </div>

      {/* Detailed Log Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-800">السجل التفصيلي</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-3">الموظف</th>
                <th className="px-5 py-3">التاريخ</th>
                <th className="px-5 py-3">بدء الدوام</th>
                <th className="px-5 py-3">إنهاء الدوام</th>
                <th className="px-5 py-3">إجمالي الساعات</th>
                <th className="px-5 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{record.staff.name}</td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(record.date)}</td>
                  <td className="px-5 py-3 text-gray-600">{formatTime(record.clockIn)}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {record.clockOut ? formatTime(record.clockOut) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {record.totalHours ? `${record.totalHours.toFixed(2)} ساعة` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${
                      record.status === 'ACTIVE' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {record.status === 'ACTIVE' ? 'قيد العمل' : 'مكتمل'}
                    </span>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                    لا توجد سجلات حضور بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
