'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart3, ShoppingCart, Activity, History,
  Coffee, Tags, BookOpen, Settings2, Warehouse, Droplet, AlertTriangle,
  Users, User, UserCog, DollarSign, TrendingUp, Award, Bot, MessageCircle,
  Settings, Store, Shield, LogOut, ChevronDown, Flame, UtensilsCrossed, Sliders,
  CheckCircle2, Wallet, Receipt
} from 'lucide-react';
import { useState } from 'react';

type NavGroup = {
  title: string;
  items: { href: string; label: string; icon: any }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'مركز التحكم',
    items: [
      { href: '/owner/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
      { href: '/owner/copilot', label: 'مساعد المالك', icon: Bot },
      { href: '/owner/management', label: 'الإدارة المتكاملة', icon: Sliders },
      { href: '/owner/products', label: 'المنيو', icon: Coffee },
      { href: '/owner/catalog', label: 'الكatalogue العام', icon: BookOpen },
      { href: '/owner/orders', label: 'الطلبات', icon: ShoppingCart },
      { href: '/owner/inventory', label: 'المخزون', icon: Warehouse },
      { href: '/owner/refrigerator', label: 'الثلاجة', icon: Droplet },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { href: '/owner/employees', label: 'الموظفين', icon: Users },
      { href: '/owner/attendance', label: 'الحضور', icon: Activity },
      { href: '/owner/drivers', label: 'السائقين', icon: UserCog },
      { href: '/owner/payments', label: 'المدفوعات', icon: DollarSign },
      { href: '/owner/debts', label: 'الديون', icon: Receipt },
      { href: '/owner/playstation', label: 'البلايستيشن', icon: Activity },
      { href: '/owner/customers', label: 'العملاء', icon: User },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/owner/reports', label: 'التقارير', icon: BarChart3 },
      { href: '/owner/closing', label: 'الإغلاق اليومي', icon: CheckCircle2 },
      { href: '/owner/settlements', label: 'التسويات', icon: Wallet },
      { href: '/owner/notifications', label: 'الإشعارات', icon: AlertTriangle },
      { href: '/owner/settings', label: 'الإعدادات', icon: Settings },
    ],
  },
];

NAV_GROUPS[0].items.splice(2, 0, { href: '/owner/forecasting', label: 'التوقعات والمحاكاة', icon: TrendingUp });

interface OwnerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerSidebar({ isOpen, onClose }: OwnerSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 flex h-screen w-[260px] flex-col bg-[var(--sonex-espresso)] border-e border-white/5 transition-transform duration-300 ease-in-out md:translate-x-0 ${
        isOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
      } shadow-2xl shadow-black/50`}
    >
      <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-6 shrink-0 bg-[#17100e]">
        <div className="flex items-center gap-3">
          <Image
            src="/sonex-logo.png"
            alt="Sonex"
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg bg-[#FDFBF7] object-cover"
            priority
          />
          <span className="truncate text-lg font-black text-[#FDFBF7] tracking-wide">سونيك كوفي</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {NAV_GROUPS.map((group, idx) => (
          <div key={idx} className="mb-6 last:mb-2">
            <h3 className="mb-3 px-3 text-[11px] font-black uppercase tracking-wider text-[#A69C98]/60">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== '/owner/dashboard' && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-all duration-200 group ${
                      isActive
                        ? 'bg-[#8C6239]/15 text-[#D4A373] shadow-inner'
                        : 'text-[#A69C98] hover:bg-white/5 hover:text-[#FDFBF7]'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'}`} />
                    <span className="truncate">{label}</span>
                    {isActive && (
                      <div className="ms-auto h-1.5 w-1.5 rounded-full bg-[#D4A373] shadow-[0_0_8px_#D4A373]"></div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4 shrink-0 bg-[#17100e]">
        <Link
          href="/auth/cafe/login"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors group"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 group-hover:-translate-x-1 transition-transform" />
          <span>تسجيل الخروج</span>
        </Link>
      </div>
    </aside>
  );
}
