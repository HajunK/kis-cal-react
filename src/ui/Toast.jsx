import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const TOAST_VISIBLE_MS = 4000;

const ToastContext = createContext(null);

// The app's toast (.signin-toast, as showToast in shared.js draws it): one
// message at a time at the bottom of the window, gone after four seconds. A
// new message replaces the one showing and restarts the clock. The element
// stays on the page, invisible, so each message transitions in.
export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: null, visible: false });
  const timerRef = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(timerRef.current);
    setToast({ message, visible: true });
    timerRef.current = setTimeout(() => setToast((current) => ({ ...current, visible: false })), TOAST_VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {createPortal(
        <div className={`signin-toast${toast.visible ? " signin-toast--visible" : ""}`} role="status">
          {toast.message}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

// showToast(message), where message is text or elements (for a toast-link).
export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast needs a ToastProvider above it");
  return showToast;
}
