// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { MODAL_EXIT_MS, Modal } from "./Modal.jsx";
import { TOAST_VISIBLE_MS, ToastProvider, useToast } from "./Toast.jsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Modal", () => {
  function Harness({ onClose = () => {} }) {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(false)}>outside close</button>
        <Modal
          open={open}
          name="confirm-dialog"
          label="Test"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <p>inside</p>
        </Modal>
      </>
    );
  }

  it("transitions in with the --visible classes", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Test" });
    expect(dialog.className).toBe("confirm-dialog confirm-dialog--visible");
    expect(dialog.parentElement.className).toBe("confirm-dialog-overlay confirm-dialog-overlay--visible");
  });

  it("stays for its exit transition, then goes", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByText("outside close"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toBe("confirm-dialog");
    act(() => vi.advanceTimersByTime(MODAL_EXIT_MS));
    expect(screen.queryByRole("dialog")).toBe(null);
  });

  it("closes on Escape and on the overlay, not on a click inside", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a click on the overlay", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog").parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can name its box separately from its overlay", () => {
    render(
      <Modal open name="settings-modal" dialog="settings-modal-card" className="settings-card settings-modal-card" onClose={() => {}}>
        x
      </Modal>
    );
    expect(screen.getByRole("dialog").className).toBe("settings-card settings-modal-card settings-modal-card--visible");
  });
});

describe("ConfirmDialog", () => {
  it("confirms or cancels, once per opening", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = { title: "Sure?", message: "It goes.", confirmLabel: "Do it", onConfirm, onCancel };
    const { rerender } = render(<ConfirmDialog open {...props} />);
    expect(screen.getByText("It goes.")).toBeTruthy();
    fireEvent.click(screen.getByText("Do it"));
    // A second click as it fades out does nothing.
    fireEvent.click(screen.getByText("Do it"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(0);

    rerender(<ConfirmDialog open={false} {...props} />);
    rerender(<ConfirmDialog open {...props} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("waits for the email to be typed, in any case", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Delete?" message="Gone." confirmLabel="Delete" requireEmail="student@kis.ac" onConfirm={onConfirm} onCancel={() => {}} />
    );
    const input = screen.getByPlaceholderText("Type your email to confirm");
    expect(document.activeElement).toBe(input);
    const confirm = screen.getByText("Delete");
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "student@kis" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: " Student@KIS.ac " } });
    expect(confirm.disabled).toBe(false);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("Toast", () => {
  function Trigger({ message }) {
    const showToast = useToast();
    return <button onClick={() => showToast(message)}>show {message}</button>;
  }

  it("shows a message, replaces it with a newer one, and hides after four seconds", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="first" />
        <Trigger message="second" />
      </ToastProvider>
    );
    const toast = screen.getByRole("status");
    expect(toast.className).toBe("signin-toast");

    fireEvent.click(screen.getByText("show first"));
    expect(toast.textContent).toBe("first");
    expect(toast.className).toBe("signin-toast signin-toast--visible");

    act(() => vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1000));
    fireEvent.click(screen.getByText("show second"));
    act(() => vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1));
    expect(toast.textContent).toBe("second");
    expect(toast.className).toBe("signin-toast signin-toast--visible");
    act(() => vi.advanceTimersByTime(1));
    expect(toast.className).toBe("signin-toast");
  });
});
