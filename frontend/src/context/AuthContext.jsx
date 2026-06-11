import React, { createContext, useContext, useMemo, useState } from 'react';
import { apiFetch } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('sgi_auditoria_user');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem('sgi_auditoria_token', data.token);
    localStorage.setItem('sgi_auditoria_user', JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('sgi_auditoria_token');
    localStorage.removeItem('sgi_auditoria_user');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
