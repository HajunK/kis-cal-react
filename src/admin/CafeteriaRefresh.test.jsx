// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CafeteriaRefresh } from "./CafeteriaRefresh.jsx";

afterEach(cleanup);

const timestamp = (value) => ({
  toMillis: () => value,
  isEqual: (other) => value === other?.toMillis(),
});

function setup() {
  let receive;
  const unsubscribe = vi.fn();
  const set = vi.fn().mockResolvedValue(undefined);
  const doc = vi.fn(() => ({
    set,
    onSnapshot: (_options, listener) => {
      receive = listener;
      return unsubscribe;
    },
  }));
  const onSuccess = vi.fn();
  const page = { db: { collection: vi.fn(() => ({ doc })) }, serverTimestamp: () => "server time" };
  const { unmount } = render(<CafeteriaRefresh page={page} onSuccess={onSuccess} />);
  const publish = (data, fromCache = false) => act(() => receive({
    metadata: { fromCache, hasPendingWrites: false }, exists: Boolean(data), data: () => data,
  }));
  return { set, doc, onSuccess, publish, unmount, unsubscribe };
}

describe("CafeteriaRefresh", () => {
  it("submits only the timestamp and reloads weeks after the matching request succeeds", async () => {
    const { set, doc, onSuccess, publish, unmount, unsubscribe } = setup();
    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button.disabled).toBe(true);
    publish(null, true);
    expect(button.disabled).toBe(true);
    publish(null);
    fireEvent.click(button);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ requestedAt: "server time" }, { merge: true }));
    expect(doc).toHaveBeenCalledWith("hs");

    const requestedAt = timestamp(Date.now());
    publish({ requestedAt, processedRequestAt: timestamp(1), status: "succeeded" });
    expect(screen.getByRole("status").textContent).toBe("Refresh queued.");
    expect(button.disabled).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();
    publish({ requestedAt, runningRequestAt: requestedAt, status: "running" });
    expect(screen.getByRole("status").textContent).toBe("Refreshing menus…");
    publish({ requestedAt, processedRequestAt: requestedAt, status: "succeeded" });
    expect(screen.getByRole("status").textContent).toBe("Menus updated.");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("reports failed refreshes without reloading menus", () => {
    const { onSuccess, publish } = setup();
    const requestedAt = timestamp(Date.now() - 3 * 60_000);
    publish({ requestedAt, processedRequestAt: requestedAt, status: "failed" });
    expect(screen.getByRole("status").textContent).toBe("Refresh failed.");
    expect(screen.getByRole("button", { name: "Refresh" }).disabled).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
