import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, saveToken, clearToken, getToken } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a persisted session on launch.
  useEffect(() => {
    (async () => {
      try {
        const stored = await getToken();
        if (stored) {
          setTokenState(stored);
          const { data } = await api.get<{ user: User }>("/auth/profile");
          setUser(data.user);
        }
      } catch {
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn(newToken: string, newUser: User) {
    await saveToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
  }

  async function signOut() {
    await clearToken();
    setTokenState(null);
    setUser(null);
  }

  async function refreshProfile() {
    const { data } = await api.get<{ user: User }>("/auth/profile");
    setUser(data.user);
  }

  const value = useMemo(
    () => ({ user, token, loading, signIn, signOut, refreshProfile }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
