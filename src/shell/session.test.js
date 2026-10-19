// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAppData } from "../core/sync.js";

// A Firebase the test drives: sign-in changes when it says, and each user
// doc's snapshots arrive when it sends them. Writes are recorded.
const fb = vi.hoisted(() => ({ authListener: null, docListeners: [], writes: [], user: null }));
vi.mock("./firebase.js", () => {
  const doc = (collection, id) => ({
    onSnapshot(next) {
      const entry = { collection, id, next, live: true };
      fb.docListeners.push(entry);
      return () => (entry.live = false);
    },
    get: () => Promise.resolve({ exists: false, data: () => ({}) }),
    set: (value, options) => (fb.writes.push({ collection, id, value, options }), Promise.resolve()),
  });
  return {
    hasFirebase: () => true,
    firestore: () => ({ collection: (name) => ({ doc: (id) => doc(name, id) }) }),
    firebaseAuth: () => ({
      get currentUser() {
        return fb.user;
      },
      onAuthStateChanged(listener) {
        fb.authListener = listener;
      },
    }),
  };
});
// The Calendar's cleanup is the Calendar's business (see its own tests).
const onConfirmed = vi.fn();

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const KEY = "A".repeat(43) + "=";
const student = { uid: "u1", email: "kim@kis.ac", providerData: [] };

// A confirmed server snapshot of users/uid.
function sendDoc(uid, data) {
  fb.docListeners
    .filter((entry) => entry.live && entry.collection === "users" && entry.id === uid)
    .forEach((entry) => entry.next({ exists: true, data: () => structuredClone(data), metadata: { fromCache: false, hasPendingWrites: false } }));
}

async function freshModules() {
  vi.resetModules();
  const session = await import("./session.js");
  const data = await import("./data.js");
  return { session, data };
}

// As this device caches it (normalized, every field there).
const doc = (overrides) => ({
  ...emptyAppData(),
  periods: ["English", "", "", "", "", "", "", ""],
  periodDivisions: ["10", "", "", "", "", "", "", ""],
  hiddenCourses: [],
  addedAssessments: [],
  completedTasks: [],
  email: "kim@kis.ac",
  lastModified: 5,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  fb.authListener = null;
  fb.docListeners = [];
  fb.writes = [];
  fb.user = null;
  onConfirmed.mockClear();
  localStorage.setItem("encKey_u1", KEY);
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("a returning student", () => {
  it("sees their cached data at once, and nothing is redrawn when the server agrees", async () => {
    localStorage.setItem("lastKnownUid", "u1");
    localStorage.setItem("cachedAppData_u1", JSON.stringify(doc()));
    const { session, data } = await freshModules();
    session.showCachedGuess();
    expect(session.sessionState.get().ready).toBe(true);
    expect(data.appData.periods[0]).toBe("English");
    const shown = data.sessionStore.version();

    session.startSession({ onConfirmed });
    fb.user = student;
    fb.authListener(student);
    sendDoc("u1", doc({ lastModified: 9 }));
    await flush();
    await flush();
    expect(data.sessionStore.version()).toBe(shown);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("gets the server's copy in place, without a reload, when the cache was behind", async () => {
    localStorage.setItem("lastKnownUid", "u1");
    localStorage.setItem("cachedAppData_u1", JSON.stringify(doc()));
    const { session, data } = await freshModules();
    session.showCachedGuess();
    const shown = data.sessionStore.version();
    session.startSession({ onConfirmed });
    fb.user = student;
    fb.authListener(student);
    sendDoc("u1", doc({ periods: ["Geometry", "", "", "", "", "", "", ""] }));
    await flush();
    await flush();
    expect(data.sessionStore.version()).toBe(shown + 1);
    expect(data.appData.periods[0]).toBe("Geometry");
    expect(JSON.parse(localStorage.getItem("cachedAppData_u1")).periods[0]).toBe("Geometry");
  });
});

describe("a change made elsewhere", () => {
  async function signedIn() {
    const { session, data } = await freshModules();
    session.startSession({ onConfirmed });
    fb.user = student;
    fb.authListener(student);
    sendDoc("u1", doc());
    await flush();
    await flush();
    return { session, data };
  }

  it("is put in place at once and drawn", async () => {
    const { data } = await signedIn();
    const shown = data.sessionStore.version();
    sendDoc("u1", doc({ hiddenCourses: ["English"] }));
    await flush();
    await flush();
    expect(data.appData.hiddenCourses).toEqual(["English"]);
    expect(data.sessionStore.version()).toBe(shown + 1);
  });

  it("waits to be drawn while something is being typed, then draws once it's left", async () => {
    const { data } = await signedIn();
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    const shown = data.sessionStore.version();
    sendDoc("u1", doc({ hiddenCourses: ["English"] }));
    await flush();
    await flush();
    // In place already, so a save meanwhile builds on it; not drawn yet.
    expect(data.appData.hiddenCourses).toEqual(["English"]);
    expect(data.sessionStore.version()).toBe(shown);
    input.blur();
    await flush();
    expect(data.sessionStore.version()).toBe(shown + 1);
  });

  it("isn't this tab's own save coming back", async () => {
    const { data } = await signedIn();
    const shown = data.sessionStore.version();
    sendDoc("u1", doc({ lastModified: 99 }));
    await flush();
    await flush();
    expect(data.sessionStore.version()).toBe(shown);
  });
});

describe("signing out and in", () => {
  it("drops this device's copy on signing out and shows the signed-out tabs", async () => {
    localStorage.setItem("lastKnownUid", "u1");
    localStorage.setItem("cachedAppData_u1", JSON.stringify(doc()));
    const { session, data } = await freshModules();
    session.showCachedGuess();
    session.startSession({ onConfirmed });
    fb.authListener(null);
    expect(localStorage.getItem("cachedAppData_u1")).toBe(null);
    expect(localStorage.getItem("lastKnownUid")).toBe(null);
    expect(data.currentUid).toBe(null);
    expect(data.appData.periods.every((name) => name === "")).toBe(true);
    expect(session.sessionState.get()).toMatchObject({ ready: true, user: null, avatar: null });
  });

  it("carries what was typed signed out into a brand-new account", async () => {
    const { session, data } = await freshModules();
    session.startSession({ onConfirmed });
    fb.authListener(null);
    data.appData.periods = ["Chinese", "", "", "", "", "", "", ""];
    fb.user = student;
    fb.authListener(student);
    // Waits for the account's data, as the old page reloaded to.
    expect(session.sessionState.get().ready).toBe(false);
    sendDoc("u1", {});
    await flush();
    await flush();
    expect(data.appData.periods[0]).toBe("Chinese");
    expect(session.sessionState.get().ready).toBe(true);
    await flush();
    const saved = fb.writes.filter((write) => write.collection === "users" && write.value.periods);
    expect(saved.at(-1).value.periods[0]).toBe("Chinese");
  });
});
