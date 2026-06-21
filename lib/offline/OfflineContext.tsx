// lib/offline/OfflineContext.tsx
// Resilient offline safeguard: detect connectivity so screens can disable
// writes while still rendering cached reads. Web uses navigator.onLine and the
// window online/offline events; native (no navigator) defaults to online.
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

const OnlineContext = createContext<boolean>(true);

// True unless the browser explicitly reports offline. On native (or SSR) there
// is no navigator.onLine, so we assume connectivity is available.
const getInitialOnline = (): boolean => {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
};

export const OfflineProvider = ({ children }: { children: React.ReactNode }) => {
  const [online, setOnline] = useState<boolean>(getInitialOnline());

  useEffect(() => {
    // No browser environment (native / SSR): nothing to subscribe to.
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Re-sync once after mount in case connectivity changed before listeners attached.
    setOnline(getInitialOnline());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>;
};

export const useOnline = (): boolean => useContext(OnlineContext);
