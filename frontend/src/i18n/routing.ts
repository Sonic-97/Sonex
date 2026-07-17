import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'ar',
  localePrefix: 'never',
  localeCookie: {
    name: 'SONIC_LOCALE',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365,
  },
  localeDetection: true,
});
