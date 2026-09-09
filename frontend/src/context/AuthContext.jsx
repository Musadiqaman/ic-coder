import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../api/resources.js";

const AuthContext = createContext(null);

// The actual session lives in an httpOnly cookie set by the backend — this
// context just mirrors "who is logged in" on the client so pages/components
// can read it without a network round-trip every time. `checking` is true
// only during the very first /auth/me call on page load (e.g. after a
// refresh); after that, `user` is the single source of truth.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setChecking(false);
    })();
  }, [refresh]);

  // Any API call anywhere in the app can come back 401 once the token
  // expires (or gets invalidated) — client.js broadcasts that as an event
  // instead of importing this context directly (avoids a circular import
  // and keeps client.js framework-agnostic). React here by dropping the
  // session so RequireAuth sends the person back to /login.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const me = await authApi.login({ email, password }); // throws on 401 — let the caller show the error
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Clear client state even if the network call fails — the person
      // clicked logout, so the UI should reflect that immediately.
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, checking, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
