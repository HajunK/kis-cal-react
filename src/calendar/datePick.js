// Picking a day on the Calendar by clicking it, for moving something to a new date:
// everything around the calendar dims, the calendar stays bright and its days (or in
// the Courses view a day's whole column) light up as the pointer passes over them.
// The Add popup does the same for its date row (startDatePick in addPopup.js, which
// is tied to the popup); this is the same look for what isn't the popup. Escape, or
// a click on the dimmed area, leaves without picking.

import { hideHoverTooltip, showCursorTooltip } from "../shell/ui.js";

const FADE_MS = 200;

let active = null;

// onPick(iso) with the day chosen. onEnd runs when the pick is over, picked or not,
// before onPick. color: a CSS color for the outline of the day under the pointer.
// cursor: { clientX, clientY }, where the "Select new date" tip first appears.
export function pickCalendarDate({ color, cursor, onPick, onEnd }) {
  const box = document.querySelector(".my-courses-calendar-box");
  if (!box || active) return false;

  const overlay = document.createElement("div");
  overlay.className = "calendar-pick-overlay";
  document.body.appendChild(overlay);
  if (color) box.style.setProperty("--chip-color", color);
  box.classList.add("my-courses-calendar-box--raised", "my-courses-calendar-box--picking");

  // Capture phase, ahead of the pills' own handlers, and stopped so the page
  // doesn't treat it as a click elsewhere.
  const onClick = (event) => {
    const cell = event.target.closest(".assessment-week-day, .class-grid-cell, .class-grid-head");
    if (!cell) return;
    event.stopPropagation();
    end();
    onPick(cell.dataset.iso);
  };
  box.addEventListener("click", onClick, true);

  // In the Courses view a date is a whole column: its heading and every course's cell.
  let column = null;
  const markColumn = (iso) => {
    if (iso === column) return;
    box.querySelectorAll(".class-grid-pick-col").forEach((node) => node.classList.remove("class-grid-pick-col", "class-grid-pick-col--last"));
    column = iso;
    if (!iso) return;
    const nodes = box.querySelectorAll(`.class-grid-head[data-iso="${iso}"], .class-grid-cell[data-iso="${iso}"]`);
    nodes.forEach((node) => node.classList.add("class-grid-pick-col"));
    nodes[nodes.length - 1]?.classList.add("class-grid-pick-col--last");
  };
  const onHover = (event) => {
    const hovered = event.target.closest(".class-grid-cell, .class-grid-head");
    markColumn(hovered ? hovered.dataset.iso : null);
  };
  box.addEventListener("mouseover", onHover);
  box.addEventListener("mouseleave", onHover);

  const onOverlayClick = (event) => {
    event.stopPropagation();
    end();
  };
  overlay.addEventListener("click", onOverlayClick);
  const onKeyDown = (event) => {
    if (event.key === "Escape") end();
  };
  document.addEventListener("keydown", onKeyDown);

  document.documentElement.dataset.suppressTooltips = "true";
  hideHoverTooltip();
  const removeTooltip = cursor ? showCursorTooltip("Select new date", cursor.clientX, cursor.clientY) : null;

  function end() {
    if (active !== end) return;
    active = null;
    if (onEnd) onEnd();
    if (removeTooltip) removeTooltip();
    delete document.documentElement.dataset.suppressTooltips;
    box.removeEventListener("click", onClick, true);
    box.removeEventListener("mouseover", onHover);
    box.removeEventListener("mouseleave", onHover);
    document.removeEventListener("keydown", onKeyDown);
    markColumn(null);
    box.classList.remove("my-courses-calendar-box--picking");
    overlay.classList.remove("calendar-pick-overlay--visible");
    setTimeout(() => {
      overlay.remove();
      if (!active) box.classList.remove("my-courses-calendar-box--raised");
    }, FADE_MS);
  }
  active = end;
  void overlay.offsetWidth;  // so the fade plays
  overlay.classList.add("calendar-pick-overlay--visible");
  return true;
}

// Leaves a pick in progress without choosing (the calendar is about to be redrawn).
export function cancelCalendarDatePick() {
  if (active) active();
}
