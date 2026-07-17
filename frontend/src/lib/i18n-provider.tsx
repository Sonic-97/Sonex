'use client';

import { NextIntlClientProvider } from 'next-intl';
import { AbstractIntlMessages } from 'next-intl';
import { ReactNode } from 'react';

type Props = {
  locale: string;
  messages: AbstractIntlMessages;
  children: ReactNode;
};

export function I18nProvider({ locale, messages, children }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Riyadh">
      {children}
    </NextIntlClientProvider>
  );
}
