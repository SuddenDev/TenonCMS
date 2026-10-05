import { describe, expect, it } from "vitest";
import { headroom } from "./headroom.ts";

const shown = { y: 0, hidden: false };
const options = { height: 40 };

describe("headroom", () => {
  it("stays shown near the top", () => {
    expect(headroom(shown, 30, options)).toEqual({ y: 30, hidden: false });
  });

  it("hides after scrolling down past the height", () => {
    expect(headroom(shown, 100, options)).toEqual({ y: 100, hidden: true });
  });

  it("shows on a scroll up", () => {
    expect(headroom({ y: 300, hidden: true }, 280, options)).toEqual({ y: 280, hidden: false });
  });

  it("shows at the top, even after a small scroll up", () => {
    expect(headroom({ y: 42, hidden: true }, 38, options)).toEqual({ y: 38, hidden: false });
  });

  it("stays shown while pinned", () => {
    expect(headroom(shown, 500, { ...options, pinned: true })).toEqual({ y: 500, hidden: false });
  });

  it("ignores jitter below the threshold", () => {
    const state = { y: 300, hidden: true };
    expect(headroom(state, 295, options)).toBe(state);
    expect(headroom({ y: 300, hidden: false }, 305, options)).toEqual({ y: 300, hidden: false });
  });

  it("adds up slow scrolling until it crosses the threshold", () => {
    let state = { y: 300, hidden: false };
    for (const y of [303, 306, 309]) state = headroom(state, y, options);
    expect(state).toEqual({ y: 309, hidden: true });
  });

  it("takes a custom threshold", () => {
    expect(headroom({ y: 300, hidden: false }, 320, { ...options, threshold: 30 })).toEqual({
      y: 300,
      hidden: false,
    });
  });
});
