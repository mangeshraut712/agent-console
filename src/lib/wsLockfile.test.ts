import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ws < 8.23.0 lets a peer flood Ping frames while not reading and buffer
// auto-Pongs until the process runs out of memory (websockets/ws ace7248).
const MIN = [8, 23, 0];

function lockedWs(lockfile: string): string {
  const lock = JSON.parse(readFileSync(path.resolve(__dirname, "../..", lockfile), "utf8"));
  return lock.packages["node_modules/ws"].version;
}

function atLeast(version: string, min: number[]): boolean {
  const parts = version.split(".").map(Number);
  for (let i = 0; i < min.length; i++) {
    if (parts[i] !== min[i]) return parts[i] > min[i];
  }
  return true;
}

describe("ws lockfile pins", () => {
  it.each(["package-lock.json", "agent-server/package-lock.json"])(
    "%s resolves ws to a release with the auto-Pong DoS fix",
    (lockfile) => {
      expect(atLeast(lockedWs(lockfile), MIN)).toBe(true);
    },
  );
});
