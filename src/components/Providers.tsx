'use client';
import { useEffect, type ReactNode } from 'react';
import { DataProvider } from '@/lib/data/context';
import { LangProvider } from '@/lib/i18n';
import { RouterProvider, type Route } from '@/lib/router';
import { ToastProvider } from './ui';

export function Providers({ route, go, children }: { route: Route; go: (r: Route) => void; children: ReactNode }) {
  useEffect(() => {
    try { const th = localStorage.getItem('lawha:theme'); if (th === 'dark' || th === 'light') document.documentElement.dataset.theme = th; } catch { /* ignore */ }
  }, []);
  return (
    <LangProvider>
      <DataProvider>
        <RouterProvider route={route} go={go}>
          <ToastProvider>{children}</ToastProvider>
        </RouterProvider>
      </DataProvider>
    </LangProvider>
  );
}
