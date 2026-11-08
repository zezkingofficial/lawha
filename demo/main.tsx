import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/globals.css';
import { Providers } from '../src/components/Providers';
import { LawhaApp } from '../src/components/shell/AppShell';
import { hashToRoute, routeToHash, type Route } from '../src/lib/router';

// Single-file demo: same screens as the Next.js app, routed on the URL hash
// (a plain #board-<id>) so it can run as one HTML page.
function readHash(): Route {
  return hashToRoute(location.hash);
}

function DemoApp() {
  const [route, setRoute] = useState<Route>(readHash);
  useEffect(() => {
    const on = () => setRoute(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    const h = routeToHash(r);
    if (location.hash !== h) location.hash = h; else setRoute(r);
  };
  return (
    <Providers route={route} go={go}>
      <LawhaApp />
    </Providers>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><DemoApp /></StrictMode>);
