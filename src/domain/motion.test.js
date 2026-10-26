// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { endFormativeSwap } from "./motion.js";

describe("ending a link/unlink swap", () => {
  it("gives the input its text color back, with no transition left on it", () => {
    // Under Privacy Blur an input eases its color (0.2s); handing the number back
    // has to be at once, or the blurred number fades in after the swap ends.
    document.body.innerHTML = '<ul><li><input class="score-value" /></li></ul>';
    const row = document.querySelector("li");
    const input = document.querySelector("input");
    const ghost = document.createElement("span");
    row.appendChild(ghost);
    row.classList.add("swap-animating");
    input.style.color = "transparent";
    input._swap = { ghostAnim: { cancel: vi.fn() }, spanAnim: { cancel: vi.fn() }, ghost, row, dateBtn: null };

    endFormativeSwap(input);

    expect(input.style.color).toBe("");
    expect(input.style.transition).toBe("");
    expect(input._swap).toBe(null);
    expect(ghost.isConnected).toBe(false);
    expect(row.classList.contains("swap-animating")).toBe(false);
  });
});
