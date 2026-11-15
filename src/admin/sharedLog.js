// What the admins have accepted or declined lately, kept for a few days for all of them:
// one list in Firestore (adminSuggestionLog, each document tagged with which list it is
// on), not one per admin or browser. The page reads it synchronously from a copy kept
// here, which the watch below keeps current, and which a change updates at once (the
// watch confirms it, or sets it right if the write failed).

const COLLECTION = "adminSuggestionLog";

export function createSharedLog({ log, timeField, keepMs }) {
  let db = null;
  let entries = [];
  const docFor = (id) => db.collection(COLLECTION).doc(`${log}-${id}`);
  const report = (what) => (error) => console.error(`Failed to ${what} (${log}):`, error);

  return {
    // Newest first, without any older than it's kept.
    load(now = Date.now()) {
      return entries.filter((entry) => now - entry[timeField] < keepMs).sort((a, b) => b[timeField] - a[timeField]);
    },
    // The same one again (accepted or dismissed anew) replaces the earlier entry.
    record(entry) {
      entries = [entry, ...entries.filter((other) => other.id !== entry.id)];
      // JSON, so nothing undefined is sent (Firestore refuses it).
      if (db) docFor(entry.id).set({ ...JSON.parse(JSON.stringify(entry)), log }).catch(report("save"));
      return entry;
    },
    remove(id) {
      entries = entries.filter((entry) => entry.id !== id);
      if (db) docFor(id).delete().catch(report("remove"));
    },
    // Starts following the shared list; onChange runs whenever it changes. Entries past
    // their time are deleted by whichever admin sees them first. Returns the way to stop.
    watch(database, onChange, now = () => Date.now()) {
      db = database;
      return db
        .collection(COLLECTION)
        .where("log", "==", log)
        .onSnapshot((snapshot) => {
          entries = snapshot.docs.map((doc) => doc.data());
          entries.filter((entry) => now() - entry[timeField] >= keepMs).forEach((entry) => docFor(entry.id).delete().catch(report("clear")));
          onChange();
        }, report("read"));
    },
  };
}
