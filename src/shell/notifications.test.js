// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertsOn, alertsSupported, startSuggestionAlerts, stopSuggestionAlerts, turnOffAlerts, turnOnAlerts } from "./notifications.js";

// A `suggested` list the test can change, delivered the way Firestore does:
// to whoever's listening, each time it changes.
let listeners;
let list;
let unsubscribed;
const deliver = (fromCache = false) =>
  listeners.forEach((next) =>
    next({ metadata: { fromCache }, docs: Object.entries(list).map(([id, value]) => ({ id, data: () => structuredClone(value) })) })
  );

let permission;
let shown;

beforeEach(() => {
  localStorage.clear();
  listeners = [];
  list = { old1: { courseName: "Chemistry", type: "Formative", date: "2026-10-01", emails: ["a@kis.ac"] } };
  unsubscribed = 0;
  window.firebase = {
    apps: [{}],
    firestore: () => ({
      collection: (name) => {
        expect(name).toBe("suggested");
        return {
          onSnapshot(next) {
            listeners.push(next);
            return () => {
              unsubscribed++;
              listeners = listeners.filter((l) => l !== next);
            };
          },
        };
      },
    }),
  };
  permission = "default";
  shown = [];
  class FakeNotification {
    constructor(title, options) {
      shown.push({ title, options });
    }
    close() {}
    static get permission() {
      return permission;
    }
    static requestPermission = vi.fn(async () => {
      if (permission === "default") permission = "granted";
      return permission;
    });
  }
  globalThis.Notification = FakeNotification;
  window.Notification = FakeNotification;
});

afterEach(() => {
  stopSuggestionAlerts();
  delete window.firebase;
});

describe("suggestion alerts", () => {
  it("is available, and off until it's turned on", () => {
    expect(alertsSupported()).toBe(true);
    expect(alertsOn()).toBe(false);
    startSuggestionAlerts();
    expect(listeners).toHaveLength(0);
  });

  it("announces a suggestion added after it starts, but not what was already listed", async () => {
    await turnOnAlerts();
    expect(alertsOn()).toBe(true);
    expect(listeners).toHaveLength(1);

    deliver(); // the list as it is now
    expect(shown).toEqual([]);

    list.new1 = { courseName: "AP Biology", type: "Summative", date: "2026-10-02", emails: ["kim@kis.ac"] };
    deliver();
    expect(shown).toEqual([
      { title: "New suggestion", options: expect.objectContaining({ body: "AP Biology · Summative · Oct 2", tag: "suggestion-new1" }) },
    ]);
    // Who suggested it isn't in the alert.
    expect(JSON.stringify(shown)).not.toContain("kim@kis.ac");

    deliver(); // the same list again: nothing new
    expect(shown).toHaveLength(1);
  });

  it("ignores the copy this device kept until the server's own arrives", async () => {
    await turnOnAlerts();
    deliver(true);
    list.late = { courseName: "Geometry", type: "Reassessment", date: "2026-10-05", emails: ["x@kis.ac"] };
    deliver(true);
    expect(shown).toEqual([]);
    deliver(false); // the server's list: the baseline, so even `late` isn't announced
    expect(shown).toEqual([]);
  });

  it("announces a suggestion again after it has gone from the list and come back", async () => {
    await turnOnAlerts();
    deliver();
    list.again = { courseName: "Spanish", type: "Summative", date: "2026-10-06", emails: ["x@kis.ac"] };
    deliver();
    delete list.again;
    deliver();
    list.again = { courseName: "Spanish", type: "Summative", date: "2026-10-06", emails: ["y@kis.ac"] };
    deliver();
    expect(shown.map((n) => n.options.tag)).toEqual(["suggestion-again", "suggestion-again"]);
  });

  it("turning off stops watching, and the browser refusing leaves it off", async () => {
    await turnOnAlerts();
    turnOffAlerts();
    expect(unsubscribed).toBe(1);
    expect(alertsOn()).toBe(false);

    permission = "denied";
    await expect(turnOnAlerts()).rejects.toThrow("denied");
    expect(alertsOn()).toBe(false);
    expect(listeners).toHaveLength(0);
  });

  it("picks up again on the next visit once it was turned on", async () => {
    await turnOnAlerts();
    stopSuggestionAlerts(); // the page closed
    expect(listeners).toHaveLength(0);
    startSuggestionAlerts(); // the next visit
    expect(listeners).toHaveLength(1);
  });
});
