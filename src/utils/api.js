import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';

// Helper function to make authenticated API calls
export const useApi = () => {
  const { getAuthHeaders } = useAuth();

  const apiCall = async (endpoint, options = {}) => {
    const headers = {
      ...getAuthHeaders(),
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    return response;
  };

  return { apiCall };
};

// Alternative: Direct function that takes token
export const makeApiCall = async (endpoint, options = {}, token) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  return response;
};

