// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSwipe } from "./swipe.js";

const wheel = (element, deltaX, deltaY = 0) => element.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY, cancelable: true }));

let element;
let swipes;
let stop;
beforeEach(() => {
  vi.useFakeTimers();
  element = document.createElement("div");
  swipes = [];
  stop = onSwipe(element, (direction) => swipes.push(direction));
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("onSwipe", () => {
  it("counts a sideways swipe once, however long its momentum runs", () => {
    for (let i = 0; i < 30; i++) wheel(element, 20);
    expect(swipes).toEqual([1]);
  });

  it("needs the swipe to stop before the next counts", () => {
    wheel(element, -60);
    wheel(element, -60);
    expect(swipes).toEqual([-1]);
    vi.advanceTimersByTime(100);
    wheel(element, 60);
    expect(swipes).toEqual([-1, 1]);
  });

  it("clears the momentum once it has died down, so the next swipe needn't wait", () => {
    wheel(element, 60);
    wheel(element, 30);
    wheel(element, 2);
    wheel(element, 60);
    expect(swipes).toEqual([1, 1]);
  });

  it("doesn't count a trickle of tiny movements as a swipe", () => {
    for (let i = 0; i < 100; i++) wheel(element, 2);
    expect(swipes).toEqual([]);
  });

  it("leaves up and down to the page, and small movements uncounted", () => {
    wheel(element, 0, 120);
    wheel(element, 10, 1);
    expect(swipes).toEqual([]);
  });

  it("counts a swipe on a touch screen", () => {
    const touch = (type, clientX, clientY) => {
      const event = new Event(type);
      const point = { clientX, clientY };
      event.touches = type === "touchend" ? [] : [point];
      event.changedTouches = [point];
      element.dispatchEvent(event);
    };
    touch("touchstart", 200, 100);
    touch("touchend", 100, 110);
    touch("touchstart", 100, 100);
    touch("touchend", 200, 100);
    touch("touchstart", 100, 100);
    touch("touchend", 130, 100);
    expect(swipes).toEqual([1, -1]);
  });
});
