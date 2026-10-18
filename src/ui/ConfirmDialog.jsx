import { useLayoutEffect, useRef, useState } from "react";
import { Modal } from "./Modal.jsx";

// The app's confirm dialog for destructive actions (the look of
// smShowConfirmDialog in the old settings-modal.js): a title, what will
// happen, and Cancel beside a red confirm button. Escape and a click outside
// cancel. With requireEmail, the confirm button waits until that address is
// typed in (any case), and Enter in the field confirms.
export function ConfirmDialog({ open, title, message, confirmLabel, requireEmail = null, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} name="confirm-dialog" label={title}>
      <ConfirmBody
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        requireEmail={requireEmail}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  );
}

function ConfirmBody({ open, title, message, confirmLabel, requireEmail, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  // Answered once per opening: a second click while it fades out does nothing.
  const answeredRef = useRef(false);
  useLayoutEffect(() => {
    if (open) answeredRef.current = false;
  }, [open]);
  const answer = (handler) => () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    handler();
  };
  const confirm = answer(onConfirm);
  const cancel = answer(onCancel);
  const needsEmail = requireEmail !== null;
  const matches = !needsEmail || typed.trim().toLowerCase() === requireEmail.toLowerCase();

  // Ready to type into the moment it opens.
  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  return (
    <>
      <h2 className="confirm-dialog-title">{title}</h2>
      <p className="confirm-dialog-text">{message}</p>
      {needsEmail && (
        <input
          ref={inputRef}
          type="text"
          className="confirm-dialog-input"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
          placeholder="Type your email to confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches) confirm();
          }}
        />
      )}
      <div className="confirm-dialog-actions">
        <button type="button" className="confirm-dialog-cancel-btn" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="confirm-dialog-confirm-btn" disabled={!matches} onClick={confirm}>
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
