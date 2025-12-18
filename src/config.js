// API base URL configuration
// In development, use localhost
// In production, use relative URLs (same origin)
export const API_BASE = import.meta.env.DEV 
  ? 'http://localhost:3001/api'
  : '/api';

