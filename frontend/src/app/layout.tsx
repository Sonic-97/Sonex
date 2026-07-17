import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { routing } from "@/i18n/routing";
import { I18nProvider } from "@/lib/i18n-provider";
import { hasLocale } from "next-intl";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sonic Coffee OS — Real-Time Dashboard",
  description: "Live café operations control center",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sonic Coffee" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params?: Promise<{ locale?: string }>;
}>) {
  const resolvedParams = params ? await params : undefined;
  let locale = resolvedParams?.locale || "en";
  if (!hasLocale(routing.locales, locale)) locale = routing.defaultLocale;
  const dir = locale === "ar" ? "rtl" : "ltr";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any = {};
  try {
    messages = {
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
    };
  } catch {}

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-full flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
