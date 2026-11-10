import { describe, expect, it } from "vitest";
import { mergeBatches, MAX_CHANGES } from "./emit-webhooks.ts";

describe("mergeBatches", () => {
  it("appends changes and marks the batch truncated at the cap", () => {
    const change = (n: number) => ({ n }) as never;
    const job = (changes: unknown[]) => ({ webhook: "w", changes, truncated: false }) as never;

    expect(mergeBatches(job([change(1)]), job([change(2)]))).toMatchObject({
      changes: [{ n: 1 }, { n: 2 }],
      truncated: false,
    });
    const full = job(Array.from({ length: MAX_CHANGES }, (_, i) => change(i)));
    expect(mergeBatches(full, job([change(-1)]))).toMatchObject({ truncated: true });
    expect((mergeBatches(full, job([change(-1)])) as { changes: unknown[] }).changes).toHaveLength(
      MAX_CHANGES,
    );
  });
});
