'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setCookie } from '@/lib/cookies';

const LOCALES = [
  { code: 'en', label: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'AR', dir: 'rtl' },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = locale === 'en' ? 'ar' : 'en';
    setCookie('SONIC_LOCALE', next, 365);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-50"
      title={locale === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
    >
      <span className="text-base leading-none">{locale === 'en' ? '🇸🇦' : '🇬🇧'}</span>
      <span>{LOCALES.find((l) => l.code !== locale)?.label || (locale === 'en' ? 'AR' : 'EN')}</span>
    </button>
  );
}
