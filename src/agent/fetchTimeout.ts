export class UpstreamTimeoutError extends Error {
  readonly code = "UPSTREAM_TIMEOUT";

  constructor(message = "The upstream request timed out.") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

/**
 * Fetch with a deadline. A caller abort is rethrown as-is so disconnects
 * stay distinguishable from a hung upstream.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (parent?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new UpstreamTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
