// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import { SettingsPopup } from "./SettingsPopup.jsx";

// The app's preferences (src/shell/preferences.js), kept here.
const store = vi.hoisted(() => ({ prefs: null }));
vi.mock("../shell/preferences.js", () => ({
  getPreferences: () => ({ ...store.prefs }),
  setPreference: vi.fn((key, value) => {
    store.prefs = { ...store.prefs, [key]: value };
    window.dispatchEvent(new CustomEvent("app:preferences-changed"));
  }),
  formatPreferredDate: (date, format) => `${format}-date`,
}));
const { setPreference } = await import("../shell/preferences.js");

beforeEach(() => {
  store.prefs = { appearance: "system", dateFormat: "monthDay", privacyBlurMode: "never", showBreakdown: true, showUpcomingAssessments: false, replaceFormativesByDefault: true, hideAdminTabs: false };
  setPreference.mockClear();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.mocked(window.alert).mockRestore?.();
});

function fakePage(user = { uid: "u1", email: "student@kis.ac" }) {
  const db = fakeFirestore({ users: { u1: { periods: ["English"], email: "student@kis.ac" } } });
  return {
    db,
    toasts: [],
    currentUser: () => user,
    firestore: () => db,
    googleProvider: () => ({}),
    appDataCacheKey: (uid) => `cachedAppData_${uid}`,
    prefsCacheKey: (uid) => `prefs_${uid}`,
    encKeyStorageKey: (uid) => `encKey_${uid}`,
    toast(message) {
      this.toasts.push(message);
    },
    close: vi.fn(),
  };
}

const control = (pref) => document.querySelector(`.segmented-control[data-pref="${pref}"]`);

describe("SettingsPopup", () => {
  it("shows the saved preferences and changes them", () => {
    render(<SettingsPopup page={fakePage()} />);
    expect(control("appearance").querySelector(".segmented-option--active").textContent).toBe("System");
    fireEvent.click(within(control("appearance")).getByText("Dark"));
    expect(setPreference).toHaveBeenCalledWith("appearance", "dark");
    expect(control("appearance").querySelector(".segmented-option--active").textContent).toBe("Dark");

    // Clicking the active option does nothing.
    fireEvent.click(within(control("appearance")).getByText("Dark"));
    expect(setPreference).toHaveBeenCalledTimes(1);

    const breakdown = document.querySelector('.settings-toggle[data-pref="showBreakdown"]');
    const upcoming = document.querySelector('.settings-toggle[data-pref="showUpcomingAssessments"]');
    expect([breakdown.checked, upcoming.checked]).toEqual([true, false]);
    fireEvent.click(upcoming);
    expect(setPreference).toHaveBeenLastCalledWith("showUpcomingAssessments", true);
  });

  it("labels each date format with today's date in it", () => {
    render(<SettingsPopup page={fakePage()} />);
    expect([...control("dateFormat").querySelectorAll(".segmented-option")].map((btn) => btn.textContent)).toEqual([
      "monthDay-date",
      "numeric-date",
      "dayMonth-date",
      "numericEU-date",
    ]);
  });

  it("offers hiding the admin tabs to admins only", () => {
    render(<SettingsPopup page={fakePage()} />);
    expect(screen.queryByText("Hide Admins Tabs")).toBe(null);
    cleanup();
    render(<SettingsPopup page={fakePage({ uid: "u1", email: "hjkim29@kis.ac" })} />);
    expect(screen.getByText("Hide Admins Tabs")).toBeTruthy();
  });

  it("deletes all data only once confirmed", async () => {
    const page = fakePage();
    render(<SettingsPopup page={page} />);
    fireEvent.click(screen.getByText("Delete all data"));
    expect(page.db.writes).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "Delete all data?" });
    vi.spyOn(Date, "now").mockReturnValue(9);
    // jsdom can't reload; the reload after deleting is what's being reached.
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    await act(async () => fireEvent.click(within(dialog).getByText("Delete all data")));
    expect(page.db.writes).toEqual([{ op: "set", collection: "users", id: "u1", value: { email: "student@kis.ac", lastModified: 9 } }]);
  });

  it("asks a signed-out visitor to sign in before deleting an account", () => {
    const page = fakePage(null);
    render(<SettingsPopup page={page} />);
    fireEvent.click(screen.getByText("Delete account"));
    expect(page.toasts).toEqual(["Sign in to the account you want to delete."]);
    expect(screen.queryByRole("dialog")).toBe(null);
  });

  it("needs the account's email typed to delete it", () => {
    const page = fakePage();
    render(<SettingsPopup page={page} />);
    fireEvent.click(screen.getByText("Delete account"));
    const dialog = screen.getByRole("dialog", { name: "Delete account?" });
    expect(within(dialog).getByText("Delete account").disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText("Type your email to confirm"), { target: { value: "STUDENT@kis.ac" } });
    expect(within(dialog).getByText("Delete account").disabled).toBe(false);
  });
});
