import { describe, expect, test } from "vitest";
import { abortableDelay } from "../abortableDelay";

describe("abortableDelay", () => {
  test("resolves when the timer fires", async () => {
    const signal = new AbortController().signal;
    await expect(abortableDelay(5, signal)).resolves.toBeUndefined();
  });

  test("rejects when aborted and does not settle again", async () => {
    const controller = new AbortController();
    const pending = abortableDelay(5_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
