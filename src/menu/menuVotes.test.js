import { describe, expect, it, vi } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import { agreement, readVotes, saveVote, tally, voteDocId } from "./menuVotes.js";

describe("reading votes", () => {
  it("is the day's map, or nothing yet", async () => {
    const db = fakeFirestore({ cafeteriaVotes: { "hs-2026-11-12": { votes: { u1: "A", u2: "B" } } } });
    expect(await readVotes(db, "2026-11-12")).toEqual({ u1: "A", u2: "B" });
    expect(await readVotes(db, "2026-11-13")).toEqual({});
  });
});

describe("saving a vote", () => {
  it("sets only the student's own entry, merged into the day's document", async () => {
    const db = fakeFirestore({ cafeteriaVotes: { "hs-2026-11-12": { votes: { u2: "B" } } } });
    await saveVote(db, "2026-11-12", "u1", "A", vi.fn());
    expect(db.writes).toEqual([
      { op: "set", collection: "cafeteriaVotes", id: voteDocId("2026-11-12"), value: { votes: { u1: "A" } }, options: { merge: true } },
    ]);
  });

  it("takes a vote back by deleting only that entry", async () => {
    const update = vi.fn(() => Promise.resolve());
    const db = { collection: () => ({ doc: () => ({ update }) }) };
    const removeField = vi.fn(() => "DELETE");
    await saveVote(db, "2026-11-12", "u1", null, removeField);
    expect(update).toHaveBeenCalledWith({ "votes.u1": "DELETE" });
  });
});

describe("counting", () => {
  const votes = { u1: "A", u2: "A", u3: "A", u4: "B", u5: "B" };

  it("tallies each menu", () => {
    expect(tally(votes)).toEqual({ a: 3, b: 2, total: 5 });
    expect(tally(undefined)).toEqual({ a: 0, b: 0, total: 0 });
  });

  it("says how many agree, and which way the line goes", () => {
    expect(agreement(votes, "A")).toEqual({ percent: 60, line: "longer" });
    expect(agreement(votes, "B")).toEqual({ percent: 40, line: "shorter" });
    expect(agreement({ u1: "A", u2: "B" }, "A")).toEqual({ percent: 50, line: null });
  });

  it("is nothing without a pick or any votes", () => {
    expect(agreement(votes, null)).toBe(null);
    expect(agreement({}, "A")).toBe(null);
  });
});
