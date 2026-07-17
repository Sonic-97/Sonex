'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { Settings, Save, Store, DollarSign, Clock, Sun, Moon } from 'lucide-react';

export default function OwnerSettingsPage() {
  useSocket('/owner');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    storeName: 'Sonic Coffee',
    currency: 'USD',
    openTime: '07:00',
    closeTime: '22:00',
    theme: 'light',
    taxRate: '0',
    serviceCharge: '0',
  });

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      if (data) {
        setForm((prev) => ({ ...prev, ...data }));
      }
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border bg-white p-6">
        <div className="mb-6 flex items-center gap-2">
          <Store className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-800">Store Information</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Store Name</label>
            <input type="text" value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-6 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-800">Financial Settings</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Currency</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="MXN">MXN ($)</option>
              <option value="COP">COP ($)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Tax Rate (%)</label>
            <input type="number" step="0.1" value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Service Charge (%)</label>
            <input type="number" step="0.1" value={form.serviceCharge}
              onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-6 flex items-center gap-2">
          <Clock className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-800">Business Hours</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Open Time</label>
            <input type="time" value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Close Time</label>
            <input type="time" value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-6 flex items-center gap-2">
          {form.theme === 'dark' ? <Moon className="h-5 w-5 text-violet-600" /> : <Sun className="h-5 w-5 text-violet-600" />}
          <h2 className="text-lg font-bold text-gray-800">Appearance</h2>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">Theme</label>
          <div className="flex gap-3">
            <button onClick={() => setForm({ ...form, theme: 'light' })}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${form.theme === 'light' ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Sun className="h-4 w-4" /> Light
            </button>
            <button onClick={() => setForm({ ...form, theme: 'dark' })}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${form.theme === 'dark' ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Moon className="h-4 w-4" /> Dark
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
