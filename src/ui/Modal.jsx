import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Matches the overlays' 0.25s transitions in the CSS.
export const MODAL_EXIT_MS = 250;

// The app's popup: an overlay with a box in it, on <body>. name is the CSS
// block: "confirm-dialog" draws .confirm-dialog-overlay around .confirm-dialog,
// each given its --visible modifier to transition in, and kept on screen for
// the transition out after open turns false. dialog names the box's block when
// it differs ("settings-modal" draws its box as .settings-modal-card), and
// className replaces the box's classes. Escape or a click on the overlay calls
// onClose.
export function Modal({ open, onClose, name, dialog = name, className = dialog, label, children }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // The hidden starting state is laid out before the --visible classes go on,
  // so they transition rather than snap.
  useLayoutEffect(() => {
    if (!open || !mounted || !dialogRef.current) return;
    void dialogRef.current.offsetWidth;
    setVisible(true);
  }, [open, mounted]);

  // One listener for as long as it's open, calling the latest onClose. Swapped
  // on every new onClose, it could be swapped out during the very Escape that
  // closes another popup (which re-renders this one), and miss it: a confirm
  // over Settings would then vanish with Settings instead of closing itself.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div
      className={`${name}-overlay${visible ? ` ${name}-overlay--visible` : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`${className}${visible ? ` ${dialog}--visible` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
