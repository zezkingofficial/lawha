'use client';
import { usePathname, useRouter as useNextRouter } from 'next/navigation';
import { Providers } from '@/components/Providers';
import { LawhaApp } from '@/components/shell/AppShell';
import { pathToRoute, routeToPath } from '@/lib/router';

export default function ClientApp() {
  const path = usePathname();
  const router = useNextRouter();
  return (
    <Providers route={pathToRoute(path)} go={(r) => router.push(routeToPath(r))}>
      <LawhaApp />
    </Providers>
  );
}
