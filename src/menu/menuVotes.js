// Which lunch menu students are going for: cafeteriaVotes/hs-YYYY-MM-DD, a document a day
// whose `votes` maps a student's uid to "A" or "B". A student's rules (firestore.rules)
// let them add, change or remove only their own entry, so a vote is written as that one
// entry (set with merge, or the entry deleted), never the whole map.

const COLLECTION = "cafeteriaVotes";

export const voteDocId = (date) => `hs-${date}`;

// The day's votes as { uid: "A" | "B" }; none with no document yet.
export function readVotes(db, date) {
  return db
    .collection(COLLECTION)
    .doc(voteDocId(date))
    .get()
    .then((snapshot) => {
      const votes = snapshot.exists ? (snapshot.data() || {}).votes : null;
      return votes && typeof votes === "object" ? votes : {};
    });
}

// choice "A" or "B" sets the student's vote; null takes it back. removeField is
// Firestore's deleteField.
export function saveVote(db, date, uid, choice, removeField) {
  const doc = db.collection(COLLECTION).doc(voteDocId(date));
  if (choice) return doc.set({ votes: { [uid]: choice } }, { merge: true });
  return doc.update({ [`votes.${uid}`]: removeField() });
}

// { a, b, total } for a day's votes.
export function tally(votes) {
  const choices = Object.values(votes || {});
  const a = choices.filter((choice) => choice === "A").length;
  const b = choices.filter((choice) => choice === "B").length;
  return { a, b, total: a + b };
}

// What a student's pick says about the lunch: the share going for the same menu (this
// includes them), and which way the line should go for them. null without a pick or votes.
export function agreement(votes, pick) {
  const { a, b, total } = tally(votes);
  if ((pick !== "A" && pick !== "B") || total === 0) return null;
  const same = pick === "A" ? a : b;
  const percent = Math.round((same / total) * 100);
  const line = same * 2 > total ? "longer" : same * 2 < total ? "shorter" : null;
  return { percent, line };
}
