import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: {
      common: (await import(`../../locales/${locale}/common.json`)).default,
      dashboard: (await import(`../../locales/${locale}/dashboard.json`)).default,
      reports: (await import(`../../locales/${locale}/reports.json`)).default,
      orders: (await import(`../../locales/${locale}/orders.json`)).default,
      products: (await import(`../../locales/${locale}/products.json`)).default,
      inventory: (await import(`../../locales/${locale}/inventory.json`)).default,
      employees: (await import(`../../locales/${locale}/employees.json`)).default,
      auth: (await import(`../../locales/${locale}/auth.json`)).default,
      validation: (await import(`../../locales/${locale}/validation.json`)).default,
      notifications: (await import(`../../locales/${locale}/notifications.json`)).default,
      pwa: (await import(`../../locales/${locale}/pwa.json`)).default,
      branches: (await import(`../../locales/${locale}/branches.json`)).default,
    },
  };
});
