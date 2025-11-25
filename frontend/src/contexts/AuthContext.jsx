import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth.service';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        authService.setAuthToken(token);
        try {
          const userData = await authService.getMe();
          setUser(userData);
        } catch (error) {
          console.error('Erro ao validar token:', error);
          localStorage.removeItem('token');
          authService.setAuthToken(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await authService.login(email, password);
      // Backend returns { success: true, data: { user, accessToken, refreshToken } }
      const { user, accessToken } = response.data;

      localStorage.setItem('token', accessToken);
      authService.setAuthToken(accessToken);
      setUser(user);
      return { success: true, user };
    } catch (error) {
      console.error('Erro no login:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Erro ao fazer login'
      };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      localStorage.removeItem('token');
      authService.setAuthToken(null);
      setUser(null);
    }
  };

  const register = async (userData) => {
    try {
      const response = await authService.register(userData);
      const { user, accessToken } = response.data;

      localStorage.setItem('token', accessToken);
      authService.setAuthToken(accessToken);
      setUser(user);
      return { success: true, user };
    } catch (error) {
      console.error('Erro no registro:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Erro ao registrar usuário'
      };
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
