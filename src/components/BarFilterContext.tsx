'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const STORAGE_KEY = 'backstage.selectedBar.v1';

interface BarFilterContextValue {
  barId: string;
  setBarId: (id: string) => void;
}

const BarFilterContext = createContext<BarFilterContextValue>({ barId: '', setBarId: () => { } });

export function BarFilterProvider({ children }: { children: ReactNode }) {
  const [barId, updateBarId] = useState('');
  useEffect(() => {
    try {
      updateBarId(localStorage.getItem(STORAGE_KEY) ?? '');
    } catch { }
  }, []);

  function setBarId(id: string) {
    updateBarId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { }
  }

  return (
    <BarFilterContext.Provider value={{ barId, setBarId }}>{children}</BarFilterContext.Provider>
  );
}

export function useBarFilter() {
  return useContext(BarFilterContext);
}
