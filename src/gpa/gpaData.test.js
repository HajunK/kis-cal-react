import { describe, expect, it, vi } from "vitest";
import { encryptValue, generateRawKeyBase64, importRawKey } from "../core/crypto.js";
import { buildGpaClasses, classesFromDomain, currentClassNames, fetchLatestDomainSnapshot, toSavedGpaClasses } from "./gpaData.js";

describe("currentClassNames", () => {
  it("lists the typed periods, combo courses split into their parts", () => {
    expect(currentClassNames(["English", "", "  ", "Korean", null, " Geometry "])).toEqual([
      "English",
      "Korean Language",
      "Korean SS",
      "Geometry",
    ]);
  });
});

describe("buildGpaClasses", () => {
  const periods = ["English", "Geometry", "AP Biology"];

  it("prefers a saved grade, then Domain's, then none", () => {
    const saved = [{ name: "English", slug: "b", label: "B" }];
    const domain = [
      { name: "English", slug: "a", label: "A" },
      { name: "Geometry", slug: "c", label: "C" },
    ];
    expect(buildGpaClasses(periods, saved, domain)).toEqual([
      { name: "English", slug: "b", label: "B" },
      { name: "Geometry", slug: "c", label: "C" },
      { name: "AP Biology", slug: null, label: null },
    ]);
  });

  it("keeps a saved row with no grade over Domain's", () => {
    const saved = [{ name: "English", slug: null, label: null }];
    expect(buildGpaClasses(["English"], saved, [{ name: "English", slug: "a", label: "A" }])).toEqual(saved);
  });

  it("drops saved grades for courses no longer taken", () => {
    expect(buildGpaClasses(["English"], [{ name: "Physics", slug: "a", label: "A" }], [])).toEqual([
      { name: "English", slug: null, label: null },
    ]);
  });
});

describe("classesFromDomain", () => {
  it("takes Domain's grade or none, ignoring saved ones", () => {
    expect(classesFromDomain(["English", "Geometry"], [{ name: "Geometry", slug: "a", label: "A" }])).toEqual([
      { name: "English", slug: null, label: null },
      { name: "Geometry", slug: "a", label: "A" },
    ]);
  });
});

describe("toSavedGpaClasses", () => {
  it("saves exactly name, slug and label, with null for no grade", () => {
    expect(
      toSavedGpaClasses([
        { name: "English", slug: "a", label: "A", change: { id: 1 } },
        { name: "Geometry", slug: "", label: "", change: { id: 2 } },
      ])
    ).toEqual([
      { name: "English", slug: "a", label: "A" },
      { name: "Geometry", slug: null, label: null },
    ]);
  });
});

describe("fetchLatestDomainSnapshot", () => {
  const fakeUserDoc = (data, { fail = false } = {}) => ({
    reads: [],
    collection(name) {
      return {
        doc: (id) => ({
          get: (options) => {
            this.reads.push({ name, id, options });
            if (fail) return Promise.reject(new Error("offline"));
            return Promise.resolve({ exists: data !== null, data: () => data });
          },
        }),
      };
    },
  });

  it("reads the server copy, decrypts it, and updates appData's copy", async () => {
    const raw = generateRawKeyBase64();
    const key = await importRawKey(raw);
    const latest = [{ name: "English", slug: "a", label: "A" }];
    const db = fakeUserDoc({ lastModified: 20, domainSnapshot: await encryptValue(key, latest) });
    const appData = { domainSnapshot: [], lastModified: 10 };
    const result = await fetchLatestDomainSnapshot({ uid: "u1", db, appData, getDeviceKey: () => Promise.resolve(key) });
    expect(result).toEqual(latest);
    expect(appData).toEqual({ domainSnapshot: latest, lastModified: 20 });
    expect(db.reads).toEqual([{ name: "users", id: "u1", options: { source: "server" } }]);
  });

  it("keeps this tab's copy when the server's is older", async () => {
    const mine = [{ name: "English", slug: "b", label: "B" }];
    const appData = { domainSnapshot: mine, lastModified: 30 };
    const getDeviceKey = vi.fn();
    const result = await fetchLatestDomainSnapshot({ uid: "u1", db: fakeUserDoc({ lastModified: 20 }), appData, getDeviceKey });
    expect(result).toBe(mine);
    expect(appData.lastModified).toBe(30);
    expect(getDeviceKey).not.toHaveBeenCalled();
  });

  it("falls back to this tab's copy when signed out or offline", async () => {
    const mine = [{ name: "English", slug: "b", label: "B" }];
    expect(await fetchLatestDomainSnapshot({ uid: null, db: null, appData: { domainSnapshot: mine } })).toBe(mine);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const offline = await fetchLatestDomainSnapshot({ uid: "u1", db: fakeUserDoc({}, { fail: true }), appData: { domainSnapshot: mine } });
    expect(offline).toBe(mine);
    vi.restoreAllMocks();
  });
});
