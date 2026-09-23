import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const TOKEN_KEY = "farm2me.token";
export const USER_KEY = "farm2me.user";

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

// Attach the bearer token from localStorage to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the session and bounce to /auth (skip if already there).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!window.location.pathname.startsWith("/auth")) {
        window.location.assign("/auth");
      }
    }
    return Promise.reject(error);
  }
);
