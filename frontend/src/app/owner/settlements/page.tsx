'use client';

import React from 'react';
import SettlementsClient from './SettlementsClient';

export default function SettlementsPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            إدارة الورديات وتسليم النقدية
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            تأكيد استلام المبالغ من الموظفين في نهاية الورديات
          </p>
        </div>
      </div>

      <SettlementsClient initialHistory={[]} />
    </div>
  );
}
