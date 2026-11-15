import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CLOSE_POPUPS_EVENT } from "../shell/ui.js";
import { saveDayLabel } from "./adminData.js";

export const MAX_DAY_LABEL_LENGTH = 60;

// Matches .popup-menu's 0.15s opacity fade (floating.css).
const EXIT_MS = 150;

// The popup for a day's label, opening under its button the way the Calendar's Add
// popup opens under its +, glass and all, and growing from the button: one line of
// text for the date. Saving it empty takes the label off. Closes on a click
// anywhere else or Escape. open turns false to close it (it's then kept for the
// exit). anchor: the button. page: { db, deleteField, toast }. onSaved(text) once
// saved.
export function DayLabelPopup({ open, anchor, iso, label, page, onSaved, onClose }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(label || "");
  const [saving, setSaving] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Placed under the button, its right edge on the button's (kept on screen),
  // then shown a frame later so the entrance transitions.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!open || !mounted || !popup) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - 8));
    popup.style.left = `${left}px`;
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.transformOrigin = `${rect.left + rect.width / 2 - left}px top`;
    void popup.offsetWidth;
    setVisible(true);
  }, [open, mounted, anchor]);

  // Another click or Escape closes it. The button itself toggles it (its own click).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const close = () => onCloseRef.current();
    const onClick = (event) => {
      if (popupRef.current && popupRef.current.contains(event.target)) return;
      if (anchor.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(CLOSE_POPUPS_EVENT, close);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(CLOSE_POPUPS_EVENT, close);
    };
  }, [open, anchor]);

  const save = () => {
    const trimmed = text.trim();
    // Nothing changed.
    if (trimmed === (label || "")) {
      onClose();
      return;
    }
    setSaving(true);
    saveDayLabel(page.db, iso, trimmed, page.deleteField)
      .then(() => {
        onSaved(trimmed);
        page.toast(trimmed ? "Label saved." : "Label removed.");
        onClose();
      })
      .catch((error) => {
        console.error("Failed to save the day's label:", error);
        page.toast("Something went wrong saving the label. Please try again.");
        setSaving(false);
      });
  };

  if (!mounted) return null;
  return createPortal(
    <div
      ref={popupRef}
      className={`popup-menu popup-menu--types calendar-glass day-label-popup${visible ? " popup-menu--visible" : ""}`}
      role="dialog"
      aria-label="Day label"
    >
      <input
        type="text"
        className="add-popup-input"
        style={{ "--chip-color": "var(--color-accent)" }}
        placeholder="Label this day"
        aria-label="Day label"
        maxLength={MAX_DAY_LABEL_LENGTH}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !saving) {
            event.preventDefault();
            save();
          }
        }}
      />
      <button type="button" className="admin-schedule-save-btn" disabled={saving} onClick={save}>
        Save
      </button>
    </div>,
    document.body
  );
}
