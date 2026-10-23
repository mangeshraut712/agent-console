const SECRET_PATTERNS: readonly RegExp[] = [
  /bearer\s+[a-z0-9._~+\/=-]{6,}/gi,
  /\b(?:sk|tvly)-[a-z0-9_-]{6,}\b/gi,
  /\b(?:api[_-]?key|access[_-]?token|secret)\b\s*[:=]\s*\S+/gi,
];

/** Strip credential-shaped fragments before an upstream body is shown or logged. */
export function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted;
}
