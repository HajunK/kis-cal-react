import { describe, expect, it } from "vitest";
import { buildMessage, shortDate, staleTokens } from "./notification.js";

describe("shortDate", () => {
  it("shortens a calendar date and leaves anything else alone", () => {
    expect(shortDate("2026-10-02")).toBe("Oct 2");
    expect(shortDate("someday")).toBe("someday");
    expect(shortDate(undefined)).toBe("");
  });
});

describe("buildMessage", () => {
  const suggestion = { courseName: "AP Biology", type: "Summative", date: "2026-10-02", emails: ["kim@kis.ac"] };

  it("says what was suggested, without who suggested it, and opens Assessments on the device's own site", () => {
    const message = buildMessage(suggestion, { token: "t1", origin: "https://kiscal.app" });
    expect(message.token).toBe("t1");
    expect(message.notification).toEqual({ title: "New suggestion", body: "AP Biology · Summative · Oct 2" });
    expect(JSON.stringify(message)).not.toContain("kim@kis.ac");
    expect(message.webpush.fcmOptions.link).toBe("https://kiscal.app/assessments");
    expect(message.webpush.notification.icon).toBe("https://kiscal.app/icons/logos/page-icon.png");
  });

  it("links only to an https origin", () => {
    expect(buildMessage(suggestion, { token: "t", origin: "http://kiscal.app" }).webpush).toBe(undefined);
    expect(buildMessage(suggestion, { token: "t", origin: "javascript:alert(1)" }).webpush).toBe(undefined);
    expect(buildMessage(suggestion, { token: "t" }).webpush).toBe(undefined);
    expect(buildMessage(suggestion, { token: "t", origin: "https://kisjcalc.com/x/y" }).webpush.fcmOptions.link).toBe("https://kisjcalc.com/assessments");
  });
});

describe("staleTokens", () => {
  it("picks out the devices the browser no longer knows, and no others", () => {
    const devices = [{ token: "a" }, { token: "b" }, { token: "c" }, { token: "d" }];
    const responses = [
      { success: true },
      { success: false, error: { code: "messaging/registration-token-not-registered" } },
      { success: false, error: { code: "messaging/internal-error" } },
      { success: false, error: { code: "messaging/invalid-registration-token" } },
    ];
    expect(staleTokens(devices, responses)).toEqual(["b", "d"]);
  });
});
