// @vitest-environment jsdom
import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { voteDays } from "./CafeteriaAdmin.jsx";

const snapshot = (docs) => ({ forEach: (callback) => docs.forEach(callback) });

describe("voteDays", () => {
  it("counts each day's votes by date, and skips other documents", () => {
    const days = voteDays(
      snapshot([
        { id: "hs-2026-11-11", data: () => ({ votes: { u1: "A", u2: "B", u3: "A" } }) },
        { id: "hs-2026-11-12", data: () => ({ votes: { u1: "B" } }) },
        { id: "notes", data: () => ({ votes: { u1: "A" } }) },
        { id: "hs-2026-11-10", data: () => ({}) },
      ])
    );
    expect(days).toEqual({
      "2026-11-11": { a: 2, b: 1, total: 3, base: { a: 2, b: 1 }, tests: {} },
      "2026-11-12": { a: 0, b: 1, total: 1, base: { a: 0, b: 1 }, tests: {} },
      "2026-11-10": { a: 0, b: 0, total: 0, base: { a: 0, b: 0 }, tests: {} },
    });
  });
});

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CafeteriaAdmin } from "./CafeteriaAdmin.jsx";

describe("test votes below zero", () => {
  it("counts them off the real votes and never shows less than 0", () => {
    const days = voteDays(snapshot([{ id: "hs-2026-11-11", data: () => ({ votes: { u1: "A", "test-01": "-A", "test-02": "-A", "test-03": "-B" } }) }]));
    expect(days["2026-11-11"]).toMatchObject({ a: 0, b: 0, total: 0, base: { a: 1, b: 0 } });
  });
});

describe("CafeteriaAdmin", () => {
  it("shows the refresh control only after a verified owner signs in", () => {
    cleanup();
    const watch = vi.fn((_options, received) => {
      received({ exists: false, metadata: { fromCache: false, hasPendingWrites: false } });
      return () => {};
    });
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false }),
          onSnapshot: watch,
        }),
        get: async () => snapshot([]),
      }),
    };
    const buildPage = (email, emailVerified) => ({
      db,
      auth: { onAuthStateChanged: (callback) => (callback({ email, emailVerified }), () => {}) },
    });
    const { unmount } = render(<CafeteriaAdmin page={buildPage("student@example.test", true)} />);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(watch).not.toHaveBeenCalled();
    unmount();

    render(<CafeteriaAdmin page={buildPage("hajunk105@gmail.com", true)} />);
    expect(screen.getByRole("button", { name: "Refresh" }).disabled).toBe(false);
    expect(watch).toHaveBeenCalledOnce();
    cleanup();
  });

  it("draws the calendar with a side panel, and shows the picked day's votes", async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;
    const page = {
      auth: { onAuthStateChanged: (callback) => (callback({ email: "hajunk105@gmail.com" }), () => {}) },
      db: {
        collection: (name) => ({
          doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ days: [{ date: iso, meals: { lunch: { ko: [{ section: "A", status: "printed", text: "쌀밥" }, { section: "B", status: "printed", text: "김치" }] } } }] }) }) }),
          get: () => Promise.resolve(snapshot([{ id: `hs-${iso}`, data: () => ({ votes: { u1: "A", u2: "A", u3: "B" } }) }])),
        }),
      },
    };
    const { container } = render(<CafeteriaAdmin page={page} />);
    expect(container.querySelector(".admin-calendar-layout .assessment-calendar-card")).not.toBeNull();
    expect(container.querySelector(".admin-calendar-layout .admin-day-panel")).not.toBeNull();
    expect(screen.getByText("Select a day")).toBeTruthy();
    await screen.findByText("Select a day");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByText("15").closest("button"));
    expect(await screen.findByRole("img", { name: "2 for Menu A, 1 for Menu B" })).toBeTruthy();
    expect(screen.getAllByText("Menu A").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "2 for Menu A, 1 for Menu B" })).toBeTruthy();
  });

  it("edits, adds and deletes a dish, saving the week's menu", async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;
    const update = vi.fn((ref, changes) => { liveWeek = { ...liveWeek, ...changes }; });
    const week = { days: [{ date: iso, meals: { lunch: { ko: [{ section: "A", status: "printed", text: "쌀밥\n김치" }, { section: "B", status: "printed", text: "국수" }] } } }] };
    let liveWeek = structuredClone(week);
    const page = {
      auth: { onAuthStateChanged: (callback) => (callback({ email: "hajunk105@gmail.com" }), () => {}) },
      db: {
        collection: () => ({
          doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => liveWeek }) }),
          get: () => Promise.resolve(snapshot([])),
        }),
        runTransaction: (callback) => callback({ get: (ref) => ref.get(), update }),
      },
    };
    cleanup();
    render(<CafeteriaAdmin page={page} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByText("15").closest("button"));
    const input = await screen.findByDisplayValue("김치");
    liveWeek.days[0].meals.lunch.ko[1].text = "메밀국수";
    fireEvent.focus(input);
    fireEvent.change(screen.getByDisplayValue("김치"), { target: { value: "깍두기" } });
    fireEvent.blur(screen.getByDisplayValue("깍두기"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1].days[0].meals.lunch.ko).toEqual([
      { section: "A", status: "printed", text: "쌀밥\n깍두기", lines: ["쌀밥", "깍두기"], manual: true },
      { section: "B", status: "printed", text: "메밀국수" },
    ]);
    fireEvent.click(screen.getByLabelText("Delete 쌀밥"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1].days[0].meals.lunch.ko[0].text).toBe("깍두기");
    expect(screen.queryByDisplayValue("쌀밥")).toBeNull();
  });
});
