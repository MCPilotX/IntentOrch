import { useCallback } from 'react';

/**
 * Hook for managing authentication headers
 * Provides a unified way to get authentication headers for API requests
 */
export function useAuthHeaders() {
  /**
   * Get authentication headers with automatic token management
   * Tries to get token from localStorage, falls back to daemon if needed
   */
  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    // Try to get token from localStorage first
    let token = localStorage.getItem('auth_token');
    
    // If no token, try to get one from daemon
    if (!token) {
      try {
        const response = await fetch('http://localhost:9658/api/auth/token');
        if (response.ok) {
          const data = await response.json();
          token = data.token;
          if (token) {
            localStorage.setItem('auth_token', token);
            console.log('[useAuthHeaders] Successfully obtained and stored auth token');
          }
        }
      } catch (error) {
        console.warn('[useAuthHeaders] Failed to get auth token from daemon:', error);
        // Continue without token, will get 401 error if endpoint requires auth
      }
    }
    
    // Return headers with token if available
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }, []);
  
  /**
   * Get authentication headers synchronously (without trying to fetch new token)
   * Use this when you need headers immediately and can't wait for async token fetch
   */
  const getAuthHeadersSync = useCallback((): HeadersInit => {
    const token = localStorage.getItem('auth_token');
    
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }, []);
  
  /**
   * Clear authentication token
   */
  const clearAuthToken = useCallback(() => {
    localStorage.removeItem('auth_token');
    console.log('[useAuthHeaders] Auth token cleared');
  }, []);
  
  /**
   * Set authentication token
   */
  const setAuthToken = useCallback((token: string) => {
    localStorage.setItem('auth_token', token);
    console.log('[useAuthHeaders] Auth token set');
  }, []);
  
  /**
   * Check if user is authenticated (has a token)
   */
  const isAuthenticated = useCallback((): boolean => {
    return !!localStorage.getItem('auth_token');
  }, []);
  
  return {
    getAuthHeaders,
    getAuthHeadersSync,
    clearAuthToken,
    setAuthToken,
    isAuthenticated,
  };
}