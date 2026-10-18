import { useLayoutEffect, useRef, useState } from "react";
import { saveSchedule } from "./adminData.js";
import {
  arrangeScheduleRows,
  customDaySchedule,
  enableScheduleReorder,
  readScheduleRows,
  renderScheduleRows,
  scheduleRowsComplete,
  scheduleSlotsFor,
} from "./bellSchedule.js";

// The Bell Schedule popup for one date, inside its Modal: the slots' times
// (the same every day) and this date's events in them, draggable. Its rows are
// built and moved by bellSchedule.js; React leaves .admin-schedule-rows to it.
// page: { db, deleteField, toast }. onSaved({ schedule, custom }) once saved.
export function BellScheduleModal({ iso, sched, dayTypes, page, onSaved, onClose }) {
  const rowsRef = useRef(null);
  const resetRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const dayType = dayTypes[iso];
  const dateLabel = new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Only offered while the day differs from normal.
  const syncResetButton = () => {
    resetRef.current.hidden = !customDaySchedule(iso, readScheduleRows(rowsRef.current).day, sched, dayTypes);
  };

  useLayoutEffect(() => {
    const rows = rowsRef.current;
    renderScheduleRows(rows, scheduleSlotsFor(iso, sched, dayTypes), sched, dayType);
    enableScheduleReorder(rows, dayType);
    syncResetButton();
    // Dropping or moving by keyboard rearranges the events.
    const observer = new MutationObserver(syncResetButton);
    observer.observe(rows, { childList: true, subtree: true });
    return () => observer.disconnect();
    // Built once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps any times typed in the meantime.
  const reset = () => {
    const rows = rowsRef.current;
    const typed = new Map(
      [...rows.querySelectorAll(".admin-schedule-row[data-slot]")].map((row) => [
        row.dataset.slot,
        [...row.querySelectorAll(".admin-schedule-time-input")].map((input) => input.value),
      ])
    );
    const before = new Map(
      [...rows.querySelectorAll(".admin-schedule-event")].map((event) => [event.dataset.key, event.getBoundingClientRect().top])
    );
    renderScheduleRows(rows, scheduleSlotsFor(iso, sched, dayTypes, null), sched, dayType);
    rows.querySelectorAll(".admin-schedule-row").forEach((row) => {
      const values = typed.get(row.dataset.slot);
      if (values) row.querySelectorAll(".admin-schedule-time-input").forEach((input, i) => (input.value = values[i]));
    });
    // Each event glides from where it was to its normal place.
    const fromTops = new Map(
      [...rows.querySelectorAll(".admin-schedule-row")].map((row) => [row, before.get(row.querySelector(".admin-schedule-event").dataset.key)])
    );
    arrangeScheduleRows(rows, dayType, true, fromTops);
    syncResetButton();
  };

  const save = () => {
    const rows = rowsRef.current;
    if (!scheduleRowsComplete(rows)) {
      page.toast("Fill in every start and end time first.");
      return;
    }
    const { schedule, day } = readScheduleRows(rows);
    const custom = customDaySchedule(iso, day, sched, dayTypes);
    setSaving(true);
    saveSchedule(page.db, iso, schedule, custom, page.deleteField)
      .then(() => {
        onSaved({ schedule, custom });
        page.toast("Schedule saved.");
        onClose();
      })
      .catch((error) => {
        console.error("Failed to save schedule:", error);
        page.toast("Something went wrong saving the schedule. Please try again.");
        setSaving(false);
      });
  };

  return (
    <>
      <button type="button" className="admin-schedule-close-btn" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="admin-schedule-heading">
        <h2 className="admin-schedule-title">Bell Schedule</h2>
        <p className="admin-schedule-date">{dayType === "A" || dayType === "B" ? `${dateLabel} · ${dayType} Day` : dateLabel}</p>
      </div>
      <div className="admin-schedule-rows" ref={rowsRef} />
      <div className="admin-schedule-footer">
        <button type="button" className="admin-schedule-reset-btn" ref={resetRef} onClick={reset}>
          Reset this day
        </button>
      </div>
      <button type="button" className="admin-schedule-save-btn" disabled={saving} onClick={save}>
        Save Schedule
      </button>
    </>
  );
}
