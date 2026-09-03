"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Tenant } from "@/lib/domain";
import { getTenants } from "@/lib/services";

const STORAGE_KEY = "central-tenant";

interface TenantContextValue {
  tenants: Tenant[];
  current: Tenant | null;
  isLoading: boolean;
  select: (id: string) => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenants: [],
  current: null,
  isLoading: true,
  select: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getTenants().then((list) => {
      if (!alive) return;
      setTenants(list);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setCurrentId(
        saved && list.some((t) => t.id === saved) ? saved : (list[0]?.id ?? null),
      );
      setIsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const select = useCallback((id: string) => {
    setCurrentId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenants,
      current: tenants.find((t) => t.id === currentId) ?? null,
      isLoading,
      select,
    }),
    [tenants, currentId, isLoading, select],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
