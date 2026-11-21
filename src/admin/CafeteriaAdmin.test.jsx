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

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CafeteriaAdmin } from "./CafeteriaAdmin.jsx";

describe("test votes below zero", () => {
  it("counts them off the real votes and never shows less than 0", () => {
    const days = voteDays(snapshot([{ id: "hs-2026-11-11", data: () => ({ votes: { u1: "A", "test-01": "-A", "test-02": "-A", "test-03": "-B" } }) }]));
    expect(days["2026-11-11"]).toMatchObject({ a: 0, b: 0, total: 0, base: { a: 1, b: 0 } });
  });
});

describe("CafeteriaAdmin", () => {
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
    const update = vi.fn(() => Promise.resolve());
    const week = { days: [{ date: iso, meals: { lunch: { ko: [{ section: "A", status: "printed", text: "쌀밥\n김치" }, { section: "B", status: "printed", text: "국수" }] } } }] };
    const page = {
      auth: { onAuthStateChanged: (callback) => (callback({ email: "hajunk105@gmail.com" }), () => {}) },
      db: {
        collection: () => ({
          doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => week }), update }),
          get: () => Promise.resolve(snapshot([])),
        }),
      },
    };
    cleanup();
    render(<CafeteriaAdmin page={page} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByText("15").closest("button"));
    const input = await screen.findByDisplayValue("김치");
    fireEvent.focus(input);
    fireEvent.change(screen.getByDisplayValue("김치"), { target: { value: "깍두기" } });
    fireEvent.blur(screen.getByDisplayValue("깍두기"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].days[0].meals.lunch.ko[0].text).toBe("쌀밥\n깍두기");
    fireEvent.click(screen.getByLabelText("Delete 쌀밥"));
    expect(update.mock.calls[1][0].days[0].meals.lunch.ko[0].text).toBe("깍두기");
    expect(screen.queryByDisplayValue("쌀밥")).toBeNull();
  });
});
