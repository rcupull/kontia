import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { SessionUser } from "./types";

type AuthValue = {
  loading: boolean;
  setupRequired: boolean;
  user: SessionUser | null;
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const cachedUserKey = "kontia-pos-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [setup, session] = await Promise.all([
        api.setupStatus(),
        api.session(),
      ]);
      setSetupRequired(setup.required);
      setUser(session.user);
    } catch {
      if (window.location.pathname.startsWith("/pos")) {
        const cached = localStorage.getItem(cachedUserKey);
        try {
          setUser(cached ? (JSON.parse(cached) as SessionUser) : null);
        } catch {
          localStorage.removeItem(cachedUserKey);
          setUser(null);
        }
      } else setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (user) localStorage.setItem(cachedUserKey, JSON.stringify(user));
    else if (navigator.onLine) localStorage.removeItem(cachedUserKey);
  }, [user]);
  const value = useMemo(
    () => ({ loading, setupRequired, user, refresh, setUser }),
    [loading, setupRequired, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
