// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("showSignInToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const toast = () => document.querySelector(".signin-toast");
  const shown = () => toast()?.classList.contains("signin-toast--visible");

  it("shows at most once in 10 seconds, counted from when it last appeared", async () => {
    const { showSignInToast } = await import("./ui.js");
    showSignInToast();
    expect(shown()).toBe(true);

    // It has gone by 5s, and asking again changes nothing.
    vi.advanceTimersByTime(5000);
    expect(shown()).toBe(false);
    showSignInToast();
    expect(shown()).toBe(false);

    // 10s after the first showing.
    vi.advanceTimersByTime(5000);
    showSignInToast();
    expect(shown()).toBe(true);
  });

  it("doesn't restart while it's showing", async () => {
    const { showSignInToast } = await import("./ui.js");
    showSignInToast();
    vi.advanceTimersByTime(3000);
    showSignInToast();
    vi.advanceTimersByTime(1100);
    expect(shown()).toBe(false);
  });
});
