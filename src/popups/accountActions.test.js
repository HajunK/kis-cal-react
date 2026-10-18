import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import { deleteAccount, deleteAllData } from "./accountActions.js";

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return { map, removeItem: (key) => map.delete(key) };
}

const keys = { appData: (uid) => `cachedAppData_${uid}`, prefs: (uid) => `prefs_${uid}`, encKey: (uid) => `encKey_${uid}` };
const stored = () => fakeStorage({ cachedAppData_u1: "{}", prefs_u1: "{}", encKey_u1: "key", cachedAppData_other: "{}" });

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("deleteAllData", () => {
  it("replaces the user doc with just the email, keeping the login key", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500);
    const db = fakeFirestore({ users: { u1: { periods: ["English"], domainScores: "cipher", email: "a@kis.ac" } } });
    const storage = stored();
    const alert = vi.fn();
    const reload = vi.fn();
    await deleteAllData({ user: { uid: "u1", email: "a@kis.ac" }, db, storage, keys, alert, reload });

    // A plain set, not a merge, so nothing old is left behind.
    expect(db.writes).toEqual([{ op: "set", collection: "users", id: "u1", value: { email: "a@kis.ac", lastModified: 500 } }]);
    expect(db.data.users.get("u1")).toEqual({ email: "a@kis.ac", lastModified: 500 });
    expect([...storage.map.keys()]).toEqual(["encKey_u1", "cachedAppData_other"]);
    expect(alert).toHaveBeenCalledWith("All your data has been deleted.");
    expect(reload).toHaveBeenCalled();
  });

  it("leaves the cache alone and says so when the write fails", async () => {
    const db = fakeFirestore({ users: { u1: { periods: ["English"] } } });
    db.failNext("set");
    const storage = stored();
    const alert = vi.fn();
    const reload = vi.fn();
    await deleteAllData({ user: { uid: "u1", email: "" }, db, storage, keys, alert, reload });
    expect(storage.map.size).toBe(4);
    expect(alert).toHaveBeenCalledWith("Something went wrong deleting your data. Please try again.");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  const user = (deleteImpl) => ({ uid: "u1", delete: vi.fn(deleteImpl), reauthenticateWithPopup: vi.fn(() => Promise.resolve()) });

  it("deletes the doc, then the account, then this device's copies", async () => {
    const db = fakeFirestore({ users: { u1: { periods: [] }, u2: { periods: [] } } });
    const storage = stored();
    const goTo = vi.fn();
    const account = user(() => Promise.resolve());
    await deleteAccount({ user: account, db, googleProvider: {}, storage, keys, alert: vi.fn(), goTo });
    expect(db.writes).toEqual([{ op: "delete", collection: "users", id: "u1" }]);
    expect([...db.data.users.keys()]).toEqual(["u2"]);
    expect(account.delete).toHaveBeenCalledTimes(1);
    expect([...storage.map.keys()]).toEqual(["cachedAppData_other"]);
    expect(goTo).toHaveBeenCalledWith("/domain");
  });

  it("asks to sign in again when Google wants a recent sign-in", async () => {
    let first = true;
    const account = user(() => {
      if (!first) return Promise.resolve();
      first = false;
      return Promise.reject(Object.assign(new Error("old"), { code: "auth/requires-recent-login" }));
    });
    const provider = { id: "google" };
    const goTo = vi.fn();
    await deleteAccount({ user: account, db: fakeFirestore({ users: { u1: {} } }), googleProvider: provider, storage: stored(), keys, alert: vi.fn(), goTo });
    expect(account.reauthenticateWithPopup).toHaveBeenCalledWith(provider);
    expect(account.delete).toHaveBeenCalledTimes(2);
    expect(goTo).toHaveBeenCalled();
  });

  it("keeps this device's copies when the account couldn't be deleted", async () => {
    const storage = stored();
    const alert = vi.fn();
    const goTo = vi.fn();
    const account = user(() => Promise.reject(new Error("network")));
    await deleteAccount({ user: account, db: fakeFirestore({ users: { u1: {} } }), googleProvider: {}, storage, keys, alert, goTo });
    expect(storage.map.size).toBe(4);
    expect(alert).toHaveBeenCalledWith("Something went wrong deleting your account. Please try again.");
    expect(goTo).not.toHaveBeenCalled();
  });
});
