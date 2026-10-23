const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Browser pages on another site can open ws://localhost and read /log.
 * Non-browser clients omit Origin and stay allowed. Localhost pages are allowed
 * so the desk on :3000 can talk to the mock server. Set
 * AGENT_SERVER_ALLOWED_ORIGINS to a comma-separated origin list for anything else.
 */
export function isAllowedAgentOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  const extra = process.env.AGENT_SERVER_ALLOWED_ORIGINS;
  if (!extra) return false;
  return extra.split(",").some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    try {
      return new URL(trimmed).origin === url.origin;
    } catch {
      return trimmed.toLowerCase() === host;
    }
  });
}
