import { useAuth } from '../contexts/AuthContext';

// Helper function to make authenticated API calls
export const useApi = () => {
  const { getAuthHeaders } = useAuth();

  const apiCall = async (endpoint, options = {}) => {
    const headers = {
      ...getAuthHeaders(),
      ...options.headers
    };

    const response = await fetch(`http://localhost:3001/api${endpoint}`, {
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

  const response = await fetch(`http://localhost:3001/api${endpoint}`, {
    ...options,
    headers
  });

  return response;
};

