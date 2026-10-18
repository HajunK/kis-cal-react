import { afterEach, describe, expect, it, vi } from "vitest";
import { MODAL_EXIT_MS } from "../ui/Modal.jsx";
import { createPopupStore } from "./store.js";

afterEach(() => vi.useRealTimers());

const shown = (store) => store.get().map(({ kind, open }) => `${kind}${open ? "" : " (closing)"}`);

describe("popup store", () => {
  it("opens a fresh popup each time, and drops a closed one after its fade", () => {
    vi.useFakeTimers();
    const store = createPopupStore();
    store.open("settings");
    store.close("settings");
    store.open("settings");
    expect(shown(store)).toEqual(["settings (closing)", "settings"]);
    vi.advanceTimersByTime(MODAL_EXIT_MS);
    expect(shown(store)).toEqual(["settings"]);
  });

  it("shares one slot between Settings and Login Key, and My Courses closes them", () => {
    vi.useFakeTimers();
    const store = createPopupStore();
    store.open("settings");
    store.open("loginKey");
    expect(shown(store)).toEqual(["settings (closing)", "loginKey"]);
    store.open("myCourses", { focusPeriod: 2 });
    expect(shown(store)).toEqual(["settings (closing)", "loginKey (closing)", "myCourses"]);
    expect(store.get().at(-1).props).toEqual({ focusPeriod: 2 });
    store.open("settings");
    expect(store.isOpen("myCourses")).toBe(false);
    expect(store.isOpen("settings")).toBe(true);
  });

  it("keeps Learn More apart from the account popups", () => {
    const store = createPopupStore();
    store.open("myCourses");
    store.open("gradeProtection");
    expect(store.isOpen("myCourses")).toBe(true);
    expect(store.isOpen("gradeProtection")).toBe(true);
  });

  it("tells subscribers about each change", () => {
    const store = createPopupStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.open("settings");
    store.close("settings");
    store.close("settings");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
