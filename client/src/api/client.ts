import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

/* Every request carries the stored token, so components never handle it themselves */
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* Signing in is allowed to fail with a 401, and that answer belongs to the form, not here */
const isAuthAttempt = (url?: string) => !!url && url.includes('/auth/');

/* A 401 elsewhere means the session died, so the token goes and the app returns to login, at the path it is served from */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isAuthAttempt(error.config?.url)) {
      localStorage.removeItem('token');
      window.location.href = import.meta.env.BASE_URL;
    }
    return Promise.reject(error);
  }
);

export default apiClient;