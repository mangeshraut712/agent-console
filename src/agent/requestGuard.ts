export const MAX_INVESTIGATION_CHARS = 16_000;
export const MAX_BODY_CHARS = 64_000;

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

interface Bucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export interface RequestRejection {
  status: number;
  error: string;
}

export function resetInvestigationRateLimit(): void {
  buckets.clear();
}

export function clientKeyFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 200);
  return "local";
}

function limitFromEnv(): number {
  const raw = Number(process.env.INVESTIGATE_RATE_LIMIT);
  if (Number.isInteger(raw) && raw > 0 && raw <= 10_000) return raw;
  return DEFAULT_LIMIT;
}

/** Returns true when the caller is still inside the per-minute budget. */
export function takeInvestigationSlot(key: string, now = Date.now(), limit = limitFromEnv()): boolean {
  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(bucketKey);
    }
    while (buckets.size > 5_000) {
      const oldest = buckets.keys().next().value;
      if (!oldest) break;
      buckets.delete(oldest);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { resetAt: now + WINDOW_MS, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function rejectInvestigationRequest(request: Request, rawBody: string): RequestRejection | null {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
    return { status: 413, error: "Request body is too large." };
  }
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "Content-Type must be application/json." };
  }
  const origin = request.headers.get("origin");
  if (origin && !sameOrigin(origin, request)) {
    return { status: 403, error: "Cross-origin investigations are not allowed." };
  }
  if (rawBody.length > MAX_BODY_CHARS) {
    return { status: 413, error: "Request body is too large." };
  }
  return null;
}

export function rejectInvestigationContent(content: string): RequestRejection | null {
  if (content.length > MAX_INVESTIGATION_CHARS) {
    return { status: 413, error: "Investigation content is too long." };
  }
  return null;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function sameOrigin(origin: string, request: Request): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const candidates = [request.headers.get("host"), hostOf(request.url)].filter(
    (value): value is string => Boolean(value),
  );
  return candidates.some((candidate) => hostsMatch(originUrl, candidate));
}

function hostOf(requestUrl: string): string | null {
  try {
    return new URL(requestUrl).host;
  } catch {
    return null;
  }
}

function hostsMatch(originUrl: URL, host: string): boolean {
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (originUrl.host === hostUrl.host) return true;
  return (
    LOOPBACK_HOSTS.has(originUrl.hostname) &&
    LOOPBACK_HOSTS.has(hostUrl.hostname) &&
    originUrl.port === hostUrl.port
  );
}
