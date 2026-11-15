// @vitest-environment jsdom
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
      "2026-11-11": { a: 2, b: 1, total: 3, tests: {} },
      "2026-11-12": { a: 0, b: 1, total: 1, tests: {} },
      "2026-11-10": { a: 0, b: 0, total: 0, tests: {} },
    });
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { CafeteriaAdmin } from "./CafeteriaAdmin.jsx";

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
});
