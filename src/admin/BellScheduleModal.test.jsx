// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BellScheduleModal } from "./BellScheduleModal.jsx";

afterEach(cleanup);

const SCHED = { times: null, testingBlock: null, academicSupport: null, advisory: null, daySchedules: {} };
const TUESDAY = "2026-10-13";

// A database that only records what is written to it.
function fakeDb() {
  const writes = [];
  const db = {
    writes,
    collection: (collection) => ({
      doc: (id) => ({
        set: (data, options) => {
          writes.push({ path: `${collection}/${id}`, data, options });
          return Promise.resolve();
        },
      }),
    }),
  };
  return db;
}

function open({ sched = SCHED, db = fakeDb() } = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const page = { db, deleteField: () => "DELETE", toast: vi.fn() };
  // Inside the dialog the Modal gives it (the popup measures it).
  render(
    <div className="admin-schedule-dialog">
      <BellScheduleModal iso={TUESDAY} sched={sched} dayTypes={{ [TUESDAY]: "A" }} page={page} onSaved={onSaved} onClose={onClose} />
    </div>
  );
  return { db, page, onSaved, onClose };
}

const addCustom = (name) => {
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  const field = screen.getByLabelText("Custom event name");
  fireEvent.change(field, { target: { value: name } });
  fireEvent.keyDown(field, { key: "Enter" });
};

describe("the Custom pill", () => {
  it("turns into a field, and Enter adds a row named what was typed", () => {
    open();
    addCustom("Pep Rally");
    expect(screen.getByText("Pep Rally")).toBeTruthy();
    expect(screen.getByLabelText("Pep Rally start").value).toBe("");
    // The pill is back, and the field gone.
    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
    expect(screen.queryByLabelText("Custom event name")).toBe(null);
  });

  it("adds nothing for an empty name, and puts the pill back when left empty", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const field = screen.getByLabelText("Custom event name");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByLabelText("Custom event name")).toBeTruthy();
    fireEvent.blur(field);
    expect(screen.getByRole("button", { name: "Custom" })).toBeTruthy();
    expect(document.querySelector('[data-key^="custom:"]')).toBe(null);
  });

  it("is dropped by its X, with nothing to add back", () => {
    open();
    addCustom("Pep Rally");
    fireEvent.click(screen.getByRole("button", { name: "Remove Pep Rally" }));
    expect(screen.queryByText("Pep Rally")).toBe(null);
    expect(screen.queryByRole("button", { name: /Pep Rally/ })).toBe(null);
  });
});

describe("saving a day with a custom event", () => {
  it("asks for its times first, like any event", () => {
    const { db, page } = open();
    addCustom("Pep Rally");
    fireEvent.click(screen.getByRole("button", { name: "Save Schedule" }));
    expect(page.toast).toHaveBeenCalledWith("Fill in every start and end time first.");
    expect(db.writes).toEqual([]);
  });

  it("writes it in customEvents, leaving the usual events' lists untouched by it", async () => {
    const { db, onSaved } = open();
    addCustom("Pep Rally");
    fireEvent.change(screen.getByLabelText("Pep Rally start"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Pep Rally end"), { target: { value: "10:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Schedule" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const day = db.writes[0].data.daySchedules[TUESDAY];
    expect(day.customEvents).toEqual([{ id: expect.any(String), name: "Pep Rally", start: "10:00", end: "10:15" }]);
    expect(day.included.some((key) => key.startsWith("custom:"))).toBe(false);
    expect(Object.keys(day.times).some((key) => key.startsWith("custom:"))).toBe(false);
    // The merge write goes only to the bell schedule's own document.
    expect(db.writes[0].path).toBe("periodTimes/default");
    expect(db.writes[0].options).toEqual({ merge: true });
  });

  it("shows a saved custom event again when the day is reopened", () => {
    const sched = { ...SCHED, daySchedules: { [TUESDAY]: { included: [], times: {}, customEvents: [{ id: "a1", name: "Pep Rally", start: "10:00", end: "10:15" }] } } };
    open({ sched });
    expect(screen.getByLabelText("Pep Rally start").value).toBe("10:00");
    expect(screen.getByLabelText("Pep Rally end").value).toBe("10:15");
  });
});
