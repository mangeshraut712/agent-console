import { describe, expect, it } from "vitest";
import { abandonUnconfirmedStream, completeActiveStream } from "../streamLifecycle";

type Msg = { isStreaming: boolean };

function fakeManager(accepts: boolean) {
  const calls: string[] = [];
  return {
    calls,
    markStreamComplete(streamId: string): boolean {
      calls.push(streamId);
      return accepts;
    },
  };
}

describe("completeActiveStream", () => {
  it("clears the active stream and stops the spinner for a matching end", () => {
    const messages: Msg[] = [{ isStreaming: true }, { isStreaming: true }];
    const manager = fakeManager(true);

    const next = completeActiveStream({ streamId: "s1", messageIdx: 1 }, "s1", messages, manager);

    expect(next).toBeNull();
    expect(messages[1]!.isStreaming).toBe(false);
    expect(messages[0]!.isStreaming).toBe(true);
    expect(manager.calls).toEqual(["s1"]);
  });

  it("ignores a STREAM_END that belongs to another stream", () => {
    const messages: Msg[] = [{ isStreaming: true }];
    const manager = fakeManager(true);
    const active = { streamId: "s1", messageIdx: 0 };

    const next = completeActiveStream(active, "s2", messages, manager);

    expect(next).toBe(active);
    expect(messages[0]!.isStreaming).toBe(true);
    expect(manager.calls).toEqual([]);
  });

  it("keeps the stream active when the manager refuses a duplicate end", () => {
    const messages: Msg[] = [{ isStreaming: true }];
    const manager = fakeManager(false);
    const active = { streamId: "s1", messageIdx: 0 };

    const next = completeActiveStream(active, "s1", messages, manager);

    expect(next).toBe(active);
    expect(messages[0]!.isStreaming).toBe(true);
    expect(manager.calls).toEqual(["s1"]);
  });

  it("completes without a manager and tolerates a stale message index", () => {
    const messages: Msg[] = [{ isStreaming: true }];

    expect(completeActiveStream({ streamId: "s1", messageIdx: 0 }, "s1", messages, null)).toBeNull();
    expect(messages[0]!.isStreaming).toBe(false);
    expect(completeActiveStream({ streamId: "s1", messageIdx: 9 }, "s1", messages, null)).toBeNull();
  });
});

describe("abandonUnconfirmedStream", () => {
  it("stops the spinner and clears the stream even when nothing is active", () => {
    const messages: Msg[] = [{ isStreaming: true }];

    expect(abandonUnconfirmedStream({ streamId: "s1", messageIdx: 0 }, messages)).toBeNull();
    expect(messages[0]!.isStreaming).toBe(false);
    expect(abandonUnconfirmedStream(null, messages)).toBeNull();
    expect(abandonUnconfirmedStream({ streamId: "s1", messageIdx: 9 }, messages)).toBeNull();
  });
});
