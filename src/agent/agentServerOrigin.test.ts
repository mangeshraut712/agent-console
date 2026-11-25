import { describe, expect, it } from "vitest";
import { isAllowedAgentOrigin } from "../../agent-server/src/origin";

describe("agent-server origin allowlist", () => {
  it("allows every loopback origin, including the IPv6 loopback", () => {
    expect(isAllowedAgentOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedAgentOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedAgentOrigin("http://[::1]:3000")).toBe(true);
  });

  it("still rejects non-loopback browser origins", () => {
    expect(isAllowedAgentOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedAgentOrigin("http://[::2]:3000")).toBe(false);
  });
});
