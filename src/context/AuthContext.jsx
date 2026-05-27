import { createContext, useContext, useState } from "react";
import {
  loginUser,
  registerUser,
  logoutUser,
  getCurrentUser,
  getToken,
} from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCurrentUser());
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(false);

  const isAuthenticated = Boolean(user && token);

  async function login(email, password) {
    setLoading(true);

    try {
      const data = await loginUser({
        email,
        password,
      });

      setUser(data.user);
      setTokenState(data.token);

      return data;
    } finally {
      setLoading(false);
    }
  }

  async function register(name, email, password) {
    setLoading(true);

    try {
      const data = await registerUser({
        name,
        email,
        password,
      });

      setUser(data.user);
      setTokenState(data.token);

      return data;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    logoutUser();
    setUser(null);
    setTokenState(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}