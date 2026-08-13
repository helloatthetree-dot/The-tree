import { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Returning from Google OAuth: let AuthCallback handle the session exchange.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("komorebi_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("komorebi_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = (data) => {
    localStorage.setItem("komorebi_token", data.access_token);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    applyAuth(res.data);
    return res.data.user;
  };

  const register = async (payload) => {
    const res = await api.post("/auth/register", payload);
    applyAuth(res.data);
    return res.data.user;
  };

  const loginWithGoogle = async (sessionId) => {
    const res = await api.post("/auth/google/session", { session_id: sessionId });
    applyAuth(res.data);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("komorebi_token");
    setUser(null);
  };

  const isStaff = user && (user.role === "admin" || user.role === "super_admin");
  const isOwner = user && user.role === "super_admin";

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout, isStaff, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
