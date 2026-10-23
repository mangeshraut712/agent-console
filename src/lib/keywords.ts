function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a keyword on token boundaries.
 * Substring matching treats "hi" as a hit inside "which" and "ship".
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`);
  return pattern.test(haystack.toLowerCase());
}
