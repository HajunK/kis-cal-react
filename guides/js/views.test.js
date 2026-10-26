// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isVisitorId, loadViewCounts, recordView, viewData, viewDocId, visitorId } from "./views.js";

describe("what is stored", () => {
  it("names the document by the guide and the browser, and holds only the two fields the rules expect", () => {
    expect(viewDocId("biology", "a".repeat(32))).toBe(`biology__${"a".repeat(32)}`);
    expect(viewData("biology", 99)).toEqual({ guide: "biology", at: 99 });
  });

  it("takes a browser id of 32 lowercase hex characters", () => {
    expect(isVisitorId("0123456789abcdef0123456789abcdef")).toBe(true);
    for (const value of ["", "abc", "G".repeat(32), "A".repeat(32), null, 5]) expect(isVisitorId(value)).toBe(false);
  });
});

// A stand-in for Firebase: the documents written, and what a read returns.
function fakeFirebase({ existing = [], denyWrites = null } = {}) {
  const writes = [];
  window.firebase = {
    initializeApp: () => {},
    apps: [{}],
    firestore: () => ({
      collection: (name) => ({
        doc: (id) => ({
          set: async (data) => {
            if (denyWrites) throw Object.assign(new Error("denied"), { code: denyWrites });
            writes.push({ collection: name, id, data });
          },
        }),
        get: async () => ({ forEach: (each) => existing.forEach((data) => each({ data: () => data })) }),
      }),
    }),
  };
  return writes;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete window.firebase;
});

describe("a browser's id", () => {
  it("is made once and kept", () => {
    const first = visitorId();
    expect(isVisitorId(first)).toBe(true);
    expect(visitorId()).toBe(first);
  });

  it("is replaced when what was kept isn't one", () => {
    localStorage.setItem("guidesVisitor", "not an id");
    expect(isVisitorId(visitorId())).toBe(true);
  });
});

describe("counting a reader", () => {
  it("writes one document for the guide, then not again from the same browser", async () => {
    const writes = fakeFirebase();
    expect(await recordView("biology", { now: 5 })).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ collection: "guideViews", id: `biology__${visitorId()}`, data: { guide: "biology", at: 5 } });
    expect(await recordView("biology")).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it("counts a second guide from the same browser separately", async () => {
    const writes = fakeFirebase();
    await recordView("biology");
    await recordView("chemistry");
    expect(writes.map((write) => write.id.split("__")[0])).toEqual(["biology", "chemistry"]);
    expect(new Set(writes.map((write) => write.id.split("__")[1])).size).toBe(1);
  });

  it("isn't counted for an admin looking at the guide", async () => {
    const writes = fakeFirebase();
    localStorage.setItem("guidesAdmin", "1");
    expect(await recordView("biology")).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("is tried again next time when the write fails, but counted once the rules say it's already there", async () => {
    fakeFirebase({ denyWrites: "unavailable" });
    expect(await recordView("biology")).toBe(false);
    fakeFirebase({ denyWrites: "permission-denied" });
    expect(await recordView("biology")).toBe(true);
    expect(await recordView("biology")).toBe(false);
  });

  it("isn't counted when there is no guide", async () => {
    const writes = fakeFirebase();
    expect(await recordView(null)).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe("totalling for an admin", () => {
  it("counts each guide's documents, most read first", async () => {
    fakeFirebase({ existing: [{ guide: "chemistry" }, { guide: "biology" }, { guide: "biology" }, { guide: "biology" }, { guide: "art" }, { at: 1 }] });
    expect(await loadViewCounts()).toEqual([
      { guide: "biology", views: 3 },
      { guide: "art", views: 1 },
      { guide: "chemistry", views: 1 },
    ]);
  });
});
