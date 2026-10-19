// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import { alertsBlocked, alertsOn, alertsSupported, keepAlertsCurrent, turnOffAlerts, turnOnAlerts } from "./notifications.js";

const USER = { uid: "u1", email: "hajunk105@gmail.com" };

let db;
let messaging;
let permission;

beforeEach(() => {
  localStorage.clear();
  db = fakeFirestore({});
  permission = "default";
  messaging = {
    getToken: vi.fn(async () => "token-1"),
    deleteToken: vi.fn(async () => true),
    onMessage: vi.fn(),
  };
  window.firebase = {
    apps: [{}],
    firestore: Object.assign(() => db, {}),
    messaging: () => messaging,
  };
  class FakeNotification {
    constructor(title, options) {
      FakeNotification.shown.push({ title, options });
    }
    close() {}
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = permission === "default" ? "granted" : permission;
      return FakeNotification.permission;
    });
    static shown = [];
    static permission = "default";
  }
  FakeNotification.permission = "default";
  window.Notification = FakeNotification;
  globalThis.Notification = FakeNotification;
  window.PushManager = function PushManager() {};
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => ({ scope: "/" })), ready: Promise.resolve({}) },
  });
});

afterEach(() => {
  delete window.firebase;
  delete window.PushManager;
});

describe("suggestion alerts", () => {
  it("is available here, and starts off", () => {
    expect(alertsSupported()).toBe(true);
    expect(alertsOn()).toBe(false);
    expect(alertsBlocked()).toBe(false);
  });

  it("turning on asks permission, registers the worker and lists this device with its own site", async () => {
    await turnOnAlerts(USER);
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/firebase-messaging-sw.js");
    expect(db.writes).toEqual([
      {
        op: "set",
        collection: "adminPushTokens",
        id: "token-1",
        value: { uid: "u1", email: "hajunk105@gmail.com", origin: location.origin, createdAt: expect.any(Number) },
      },
    ]);
    expect(alertsOn()).toBe(true);
  });

  it("lists nothing when the browser says no", async () => {
    permission = "denied";
    await expect(turnOnAlerts(USER)).rejects.toThrow("denied");
    expect(db.writes).toEqual([]);
    expect(alertsOn()).toBe(false);
    expect(alertsBlocked()).toBe(true);
  });

  it("turning off takes this device off the list and forgets its registration", async () => {
    await turnOnAlerts(USER);
    db.writes.length = 0;
    await turnOffAlerts();
    expect(db.writes).toEqual([{ op: "delete", collection: "adminPushTokens", id: "token-1" }]);
    expect(messaging.deleteToken).toHaveBeenCalled();
    expect(alertsOn()).toBe(false);
  });

  it("does nothing on a device that hasn't turned it on", async () => {
    await keepAlertsCurrent(USER);
    expect(messaging.getToken).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("swaps in a registration the browser has renewed, and shows alerts that arrive with a tab open", async () => {
    await turnOnAlerts(USER);
    db.writes.length = 0;
    messaging.getToken.mockResolvedValue("token-2");
    await keepAlertsCurrent(USER);
    expect(db.writes.map(({ op, id }) => `${op} ${id}`)).toEqual(["set token-2", "delete token-1"]);
    expect(localStorage.getItem("suggestionAlertToken")).toBe("token-2");

    const [handler] = messaging.onMessage.mock.calls[0];
    handler({ notification: { title: "New suggestion", body: "AP Biology · Summative · Oct 2" } });
    expect(Notification.shown).toEqual([
      { title: "New suggestion", options: expect.objectContaining({ body: "AP Biology · Summative · Oct 2" }) },
    ]);
  });
});
