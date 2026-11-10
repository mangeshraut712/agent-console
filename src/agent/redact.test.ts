import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("redacts Slack, Stripe, and GitHub tokens without eating surrounding text", () => {
    const input =
      "slack xoxb-1234567890-abcdefghi stripe sk_live_abc123whops hook whsec_abc123 github ghp_abcdefghijklmnopqrstuvwxyz12 and github_pat_abcdefghijklmnopqrstuv";
    const out = redactSecrets(input);
    expect(out).not.toMatch(/xoxb-/);
    expect(out).not.toMatch(/sk_live_/);
    expect(out).not.toMatch(/whsec_/);
    expect(out).not.toMatch(/ghp_/);
    expect(out).not.toMatch(/github_pat_/);
    expect(out).toContain("[redacted]");
    expect(out).toContain("slack");
    expect(out).toContain("stripe");
    expect(out).toContain("hook");
    expect(out).toContain("github");
  });
});
