import { afterEach, describe, expect, it } from "vitest";
import { isAllowedAgentOrigin } from "../../agent-server/src/origin";

describe("isAllowedAgentOrigin", () => {
  const saved = process.env.AGENT_SERVER_ALLOWED_ORIGINS;
  afterEach(() => {
    if (saved === undefined) delete process.env.AGENT_SERVER_ALLOWED_ORIGINS;
    else process.env.AGENT_SERVER_ALLOWED_ORIGINS = saved;
  });

  it("allows non-browser clients that send no Origin", () => {
    expect(isAllowedAgentOrigin(undefined)).toBe(true);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "https://LOCALHOST"])(
    "allows loopback origin %s",
    (origin) => {
      expect(isAllowedAgentOrigin(origin)).toBe(true);
    },
  );

  it("allows the IPv6 loopback origin, which URL keeps bracketed", () => {
    // new URL("http://[::1]:3000").hostname is "[::1]", so a bare "::1" entry never matched.
    expect(isAllowedAgentOrigin("http://[::1]:3000")).toBe(true);
  });

  it.each(["https://evil.example", "http://localhost.evil.example", "http://[::2]:3000", "file:///x", "not a url"])(
    "rejects %s",
    (origin) => {
      delete process.env.AGENT_SERVER_ALLOWED_ORIGINS;
      expect(isAllowedAgentOrigin(origin)).toBe(false);
    },
  );

  it("allows origins listed in AGENT_SERVER_ALLOWED_ORIGINS by exact origin", () => {
    process.env.AGENT_SERVER_ALLOWED_ORIGINS = "https://desk.example.com, ";
    expect(isAllowedAgentOrigin("https://desk.example.com")).toBe(true);
    expect(isAllowedAgentOrigin("https://desk.example.com:8443")).toBe(false);
    expect(isAllowedAgentOrigin("http://desk.example.com")).toBe(false);
  });

  it("matches hostname-only entries, including bracketed IPv6 hosts", () => {
    process.env.AGENT_SERVER_ALLOWED_ORIGINS = "desk.internal,[fd00::5]";
    expect(isAllowedAgentOrigin("http://desk.internal:3000")).toBe(true);
    expect(isAllowedAgentOrigin("https://[fd00::5]:8443")).toBe(true);
    expect(isAllowedAgentOrigin("http://[fd00::6]:8443")).toBe(false);
  });
});
