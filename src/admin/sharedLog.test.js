import { describe, expect, it } from "vitest";
import { createSharedLog } from "./sharedLog.js";

// A Firestore with one collection, whose snapshots go to every watcher.
function fakeDb() {
  const docs = new Map();
  const watchers = [];
  const send = () => watchers.forEach((w) => w.next({ docs: [...docs.values()].filter((d) => d.log === w.log).map((d) => ({ data: () => d })) }));
  return {
    docs,
    send,
    collection: () => ({
      doc: (id) => ({
        set: (value) => (docs.set(id, value), Promise.resolve()),
        delete: () => (docs.delete(id), Promise.resolve()),
      }),
      where: (_field, _op, log) => ({ onSnapshot: (next) => (watchers.push({ log, next }), () => {}) }),
    }),
  };
}
const make = () => createSharedLog({ log: "accepted", timeField: "at", keepMs: 1000 });

describe("shared log", () => {
  it("shows an entry at once, newest first, and keeps it in Firestore for every admin", () => {
    const db = fakeDb();
    const mine = make();
    mine.watch(db, () => {}, () => 300);
    mine.record({ id: "a", at: 100 });
    mine.record({ id: "b", at: 200 });
    expect(mine.load(300).map((e) => e.id)).toEqual(["b", "a"]);
    expect([...db.docs.keys()].sort()).toEqual(["accepted-a", "accepted-b"]);
    // Another admin's browser follows the same list.
    const theirs = make();
    let changed = 0;
    theirs.watch(db, () => changed++, () => 300);
    db.send();
    expect(changed).toBe(1);
    expect(theirs.load(300).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("removes an entry for everyone, and replaces one recorded again", () => {
    const db = fakeDb();
    const log = make();
    log.watch(db, () => {});
    log.record({ id: "a", at: 100 });
    log.record({ id: "a", at: 200 });
    expect(log.load(300)).toHaveLength(1);
    log.remove("a");
    expect(log.load(300)).toEqual([]);
    expect(db.docs.size).toBe(0);
  });

  it("drops an entry once it has been kept long enough, and deletes it", () => {
    const db = fakeDb();
    const log = make();
    log.watch(db, () => {}, () => 5000);
    log.record({ id: "old", at: 0 });
    db.send();
    expect(log.load(5000)).toEqual([]);
    expect(db.docs.size).toBe(0);
  });
});
