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
  reload: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenants: [],
  current: null,
  isLoading: true,
  select: () => {},
  reload: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    getTenants()
      .then((list) => {
        if (!alive) return;
        setTenants(list);
        const saved =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        setCurrentId(
          saved && list.some((t) => t.id === saved) ? saved : (list[0]?.id ?? null),
        );
      })
      .catch(() => {
        if (alive) {
          setTenants([]);
          setCurrentId(null);
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const select = useCallback((id: string) => {
    setCurrentId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenants,
      current: tenants.find((t) => t.id === currentId) ?? null,
      isLoading,
      select,
      reload,
    }),
    [tenants, currentId, isLoading, select, reload],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
