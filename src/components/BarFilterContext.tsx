'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface BarFilterContextValue {
  barId: string;
  setBarId: (id: string) => void;
}

const BarFilterContext = createContext<BarFilterContextValue>({ barId: '', setBarId: () => {} });

export function BarFilterProvider({ children }: { children: ReactNode }) {
  const [barId, setBarId] = useState('');
  return (
    <BarFilterContext.Provider value={{ barId, setBarId }}>{children}</BarFilterContext.Provider>
  );
}

export function useBarFilter() {
  return useContext(BarFilterContext);
}
