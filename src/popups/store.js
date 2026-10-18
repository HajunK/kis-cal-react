// Which account-menu popups are on screen. As before, each open builds a fresh
// popup (so nothing carries over from the last time: the Login Key's copy
// button is a copy button again, controls start in place) and closing fades
// it out and then drops it. Settings and Login Key share one slot, as they
// shared one overlay, and opening a popup closes the others the old code
// closed.

import { MODAL_EXIT_MS } from "../ui/Modal.jsx";

const SLOT_OF = { settings: "settings", loginKey: "settings", myCourses: "myCourses", gradeProtection: "gradeProtection" };
// What opening each one closed first.
const CLOSES = {
  settings: ["settings", "myCourses"],
  loginKey: ["settings", "myCourses"],
  myCourses: ["settings", "myCourses"],
  gradeProtection: ["gradeProtection"],
};

export function createPopupStore() {
  // [{ id, kind, open, props }], in the order they were opened, so a newer
  // popup's overlay lands over an older one's, as appended overlays did.
  let popups = [];
  let nextId = 1;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());

  const close = (slot) => {
    let changed = false;
    popups = popups.map((popup) => {
      if (!popup.open || SLOT_OF[popup.kind] !== slot) return popup;
      changed = true;
      const closing = { ...popup, open: false };
      setTimeout(() => {
        popups = popups.filter((entry) => entry.id !== popup.id);
        emit();
      }, MODAL_EXIT_MS);
      return closing;
    });
    if (changed) emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => popups,
    isOpen: (slot) => popups.some((popup) => popup.open && SLOT_OF[popup.kind] === slot),
    open(kind, props = {}) {
      CLOSES[kind].forEach(close);
      popups = [...popups, { id: nextId++, kind, open: true, props }];
      emit();
    },
    close,
  };
}
