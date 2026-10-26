// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { guideKeyFromPath, isRating, loadMyRating, ratingData, ratingDocId, saveRating, signInWithGoogle, watchSignIn } from "./rating.js";

describe("which guide a page is", () => {
  it("is the first part of the address, when that is a valid key", () => {
    expect(guideKeyFromPath("/biology")).toBe("biology");
    expect(guideKeyFromPath("/Biology/")).toBe("biology");
    expect(guideKeyFromPath("/ap-bio-unit-3")).toBe("ap-bio-unit-3");
  });

  it("is nothing for the home page or a name the site uses", () => {
    expect(guideKeyFromPath("/")).toBe(null);
    expect(guideKeyFromPath("/index")).toBe(null);
    expect(guideKeyFromPath("/js")).toBe(null);
    expect(guideKeyFromPath("/%E0%A4%A")).toBe(null);
  });
});

describe("what is stored", () => {
  it("names the document by the guide and the user, and holds only the three fields the rules expect", () => {
    expect(ratingDocId("biology", "uid123")).toBe("biology__uid123");
    expect(ratingData("biology", 4, 99)).toEqual({ guide: "biology", rating: 4, updatedAt: 99 });
  });

  it("accepts whole numbers from 1 to 5", () => {
    for (const value of [1, 2, 3, 4, 5]) expect(isRating(value)).toBe(true);
    for (const value of [0, 6, 3.5, "4", null, NaN]) expect(isRating(value)).toBe(false);
  });
});

// A stand-in for Firebase: a map of documents, and an auth that can sign in.
function fakeFirebase({ signedIn = null, existing = {}, popup = "ok" } = {}) {
  const docs = new Map(Object.entries(existing));
  const writes = [];
  let listener = null;
  let current = signedIn;
  window.firebase = {
    initializeApp: () => {},
    apps: [{}],
    auth: Object.assign(
      () => ({
        onAuthStateChanged: (callback) => {
          listener = callback;
          callback(current);
          return () => {};
        },
        signInWithPopup: async () => {
          if (popup === "closed") throw Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
          if (popup === "error") throw Object.assign(new Error("blocked"), { code: "auth/popup-blocked" });
          current = { uid: "uid-new", email: "new@example.com" };
          listener?.(current);
          return { user: current };
        },
      }),
      { GoogleAuthProvider: function GoogleAuthProvider() {} }
    ),
    firestore: () => ({
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
          set: async (data) => {
            docs.set(id, data);
            writes.push({ name, id, data });
          },
        }),
      }),
    }),
  };
  return { docs, writes };
}

afterEach(() => {
  delete window.firebase;
});

describe("signing in", () => {
  it("tells who is signed in, or null, now and when it changes", async () => {
    fakeFirebase({ signedIn: null });
    const seen = [];
    await watchSignIn((user) => seen.push(user && user.uid));
    expect(seen).toEqual([null]);
    await signInWithGoogle();
    expect(seen).toEqual([null, "uid-new"]);
  });

  it("gives null when the sign-in window is closed, and the error when it fails", async () => {
    fakeFirebase({ popup: "closed" });
    expect(await signInWithGoogle()).toBe(null);
    fakeFirebase({ popup: "error" });
    await expect(signInWithGoogle()).rejects.toThrow("blocked");
  });
});

describe("rating a guide", () => {
  it("writes one document to guideRatings, named by the guide and the user", async () => {
    const { writes } = fakeFirebase();
    await saveRating("biology", 4, "uidA", { now: 1234 });
    expect(writes).toEqual([{ name: "guideRatings", id: "biology__uidA", data: { guide: "biology", rating: 4, updatedAt: 1234 } }]);
  });

  it("lets a user change their rating: the same document is written again, not a second one", async () => {
    const { docs, writes } = fakeFirebase();
    await saveRating("biology", 4, "uidA", { now: 1 });
    await saveRating("biology", 1, "uidA", { now: 2 });
    expect(writes.map((write) => write.id)).toEqual(["biology__uidA", "biology__uidA"]);
    expect(docs.size).toBe(1);
    expect(docs.get("biology__uidA")).toEqual({ guide: "biology", rating: 1, updatedAt: 2 });
    // Someone else, or the same user on another guide, has a document of their own.
    await saveRating("biology", 2, "uidB");
    await saveRating("chemistry", 5, "uidA");
    expect([...docs.keys()].sort()).toEqual(["biology__uidA", "biology__uidB", "chemistry__uidA"]);
  });

  it("passes on the error when the rating can't be saved", async () => {
    window.firebase = { initializeApp: () => {}, apps: [{}], firestore: () => ({ collection: () => ({ doc: () => ({ set: async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); } }) }) }) };
    await expect(saveRating("biology", 4, "uidA")).rejects.toThrow("denied");
  });

  it("finds a user's earlier rating, or 0", async () => {
    fakeFirebase({ existing: { biology__uidA: { guide: "biology", rating: 3, updatedAt: 1 } } });
    expect(await loadMyRating("biology", "uidA")).toBe(3);
    expect(await loadMyRating("biology", "uidB")).toBe(0);
  });

  it("is 0 when the rating can't be read at all", async () => {
    window.firebase = { initializeApp: () => {}, apps: [{}], firestore: () => { throw new Error("offline"); } };
    expect(await loadMyRating("biology", "uidA")).toBe(0);
  });

  it("refuses what isn't a guide, a user or a rating without calling Firestore", async () => {
    const { writes } = fakeFirebase();
    await expect(saveRating(null, 4, "uidA")).rejects.toThrow();
    await expect(saveRating("biology", 4, "")).rejects.toThrow(/Sign in/);
    await expect(saveRating("biology", 9, "uidA")).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
