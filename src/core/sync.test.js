import { describe, expect, it } from "vitest";
import { encryptValue, generateRawKeyBase64, importRawKey } from "./crypto.js";
import { appDataIsEmpty, cachedCopyIsCurrent, deepEqual, emptyAppData, normalizeCloudData } from "./sync.js";

describe("deepEqual", () => {
  it("ignores object key order but not array order", () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe("appDataIsEmpty", () => {
  it("treats blank periods as empty", () => {
    expect(appDataIsEmpty(emptyAppData())).toBe(true);
    expect(appDataIsEmpty({ ...emptyAppData(), periods: ["", "  ", null] })).toBe(true);
  });

  it("notices anything typed in", () => {
    expect(appDataIsEmpty({ ...emptyAppData(), periods: ["English"] })).toBe(false);
    expect(appDataIsEmpty({ ...emptyAppData(), domainScores: { English: {} } })).toBe(false);
  });
});

describe("normalizeCloudData", () => {
  it("defaults every field of an empty doc", async () => {
    const key = await importRawKey(generateRawKeyBase64());
    expect(await normalizeCloudData({}, key)).toEqual(emptyAppData());
  });

  it("decrypts the grade fields and keeps the rest", async () => {
    const key = await importRawKey(generateRawKeyBase64());
    const scores = { English: { formative: [90] } };
    const fresh = await normalizeCloudData(
      {
        periods: ["English"],
        email: "student@kis.ac",
        lastModified: 5,
        domainScores: await encryptValue(key, scores),
        gpaClasses: [{ name: "English", slug: "a" }], // saved before encryption
      },
      key
    );
    expect(fresh.periods).toEqual(["English"]);
    expect(fresh.email).toBe("student@kis.ac");
    expect(fresh.lastModified).toBe(5);
    expect(fresh.domainScores).toEqual(scores);
    expect(fresh.gpaClasses).toEqual([{ name: "English", slug: "a" }]);
    expect(fresh.domainSnapshot).toEqual([]);
  });
});

describe("cachedCopyIsCurrent", () => {
  it("uses the cache when its stamp matches", () => {
    expect(cachedCopyIsCurrent({ hasCache: true, serverVersion: 5, localVersion: 5 })).toBe(true);
    expect(cachedCopyIsCurrent({ hasCache: true, serverVersion: 6, localVersion: 5 })).toBe(false);
  });

  it("trusts the cache when the stamp couldn't be read", () => {
    expect(cachedCopyIsCurrent({ hasCache: true, failed: true })).toBe(true);
  });

  it("refetches without a cache or a stamp", () => {
    expect(cachedCopyIsCurrent({ hasCache: false, failed: true })).toBe(false);
    expect(cachedCopyIsCurrent({ hasCache: true, serverVersion: null, localVersion: null })).toBe(false);
  });
});
