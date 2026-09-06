/** In-browser mock agent used when a live WebSocket server is unavailable (GitHub Pages). */
export const DEMO_WS_URL = "demo://agent";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Default WebSocket endpoint (override with NEXT_PUBLIC_WS_URL). */
export const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? (DEMO_MODE ? DEMO_WS_URL : "ws://localhost:4747/ws");

export const WS_URL_STORAGE_KEY = "agent-console-ws-url";

export function isDemoEndpoint(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === "demo:";
  } catch {
    return false;
  }
}

export function isValidWsUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "ws:" || parsed.protocol === "wss:" || parsed.protocol === "demo:";
  } catch {
    return false;
  }
}

/** Browser-only: read persisted URL or fall back to env default. */
export function getStoredWsUrl(): string {
  if (typeof window === "undefined") return DEFAULT_WS_URL;
  const stored = localStorage.getItem(WS_URL_STORAGE_KEY);
  if (stored && isValidWsUrl(stored)) return stored.trim();
  return DEFAULT_WS_URL;
}

export function setStoredWsUrl(url: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WS_URL_STORAGE_KEY, url.trim());
}
