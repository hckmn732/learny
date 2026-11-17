'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { LiveRegion } from './live-region';

interface AnnouncerContextValue {
  announce: (message: string) => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | null>(null);

/**
 * Single polite status region of the connected shell (SPEC-803 ET-3, 4.1.3). Components announce
 * asynchronous states (apport prêt, cours généré, réponse enregistrée, synchronisation hors ligne)
 * through `useAnnounce` instead of mounting their own live region, so a screen reader hears one
 * ordered stream and no duplicate message.
 */
export function LiveAnnouncer({ children }: Readonly<{ children: ReactNode }>) {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => {
    setMessage(next);
  }, []);
  const value = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <LiveRegion data-testid="shell-live-region" message={message} politeness="polite" />
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  const context = useContext(AnnouncerContext);
  return context?.announce ?? (() => undefined);
}

export { AnnouncerContext };
