import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// A physical phone's own "localhost" is itself, not your computer — so
// hardcoding localhost only ever works in a web/simulator preview, and
// silently fails (every request errors out, including sign-in) on a real
// device via Expo Go. Instead, reuse the same LAN address the phone already
// used to load this JS bundle from Metro (Constants.expoConfig.hostUri,
// e.g. "192.168.1.5:8081") — that's provably the dev machine's reachable
// IP, no manual editing needed as your network changes.
function resolveApiBaseUrl(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra
      ?.expoClient?.hostUri;
  const host = hostUri?.split(":")[0];
  if (host && Platform.OS !== "web") {
    return `http://${host}:4000/api`;
  }
  return "http://localhost:4000/api";
}

export const API_BASE_URL = resolveApiBaseUrl();

// Visible in the Metro/terminal logs (not on-device) — the fastest way to
// confirm what host a build actually resolved to when debugging "sign in
// failed"-type reports.
// eslint-disable-next-line no-console
console.log(`[api] baseURL = ${API_BASE_URL}`);

export const TOKEN_KEY = "farm2me.token";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Attach the bearer token (if any) to every request.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A request that never got a response at all (timeout, refused connection,
// wrong host) has no `error.response` — every screen's error handling reads
// `e?.response?.data?.error ?? "<generic fallback>"`, which for a pure
// network failure silently shows just the generic fallback ("Sign in
// failed.", etc.) with zero indication of *why*. Filling in a synthetic
// response here makes the real cause (and the URL that failed) show up
// through that exact same existing pattern, with no per-screen changes.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.response = {
        data: {
          error: `Could not reach the server at ${API_BASE_URL} — check your phone is on the same Wi-Fi as your computer and the backend is running.`,
        },
      };
    }
    return Promise.reject(error);
  }
);

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
