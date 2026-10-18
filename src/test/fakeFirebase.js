// In-memory stand-ins for the compat Firestore and Auth the pages use, so
// tests never touch the real project. Every write is recorded in db.writes,
// so a test can check exactly what would have been sent.

export function fakeFirestore(collections = {}) {
  const data = Object.fromEntries(Object.entries(collections).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  const writes = [];
  const failures = {};
  let nextId = 1;

  const docsOf = (name) => {
    if (!data[name]) data[name] = new Map();
    return data[name];
  };
  // Lets a test make the next call of a kind ("get", "add", "delete") reject.
  const maybeFail = (kind) => {
    const error = failures[kind];
    if (!error) return null;
    delete failures[kind];
    return Promise.reject(error);
  };

  const db = {
    writes,
    data,
    failNext(kind, error = new Error(`fake ${kind} failure`)) {
      failures[kind] = error;
    },
    collection(name) {
      return {
        // Calls next once with the collection as it is now.
        onSnapshot(next) {
          queueMicrotask(() =>
            next({ docs: [...docsOf(name)].map(([id, value]) => ({ id, data: () => structuredClone(value) })) })
          );
          return () => {};
        },
        get() {
          return (
            maybeFail("get") ||
            Promise.resolve({
              docs: [...docsOf(name)].map(([id, value]) => ({ id, data: () => structuredClone(value) })),
            })
          );
        },
        add(value) {
          writes.push({ op: "add", collection: name, value: structuredClone(value) });
          const failed = maybeFail("add");
          if (failed) return failed;
          const id = `fake${nextId++}`;
          docsOf(name).set(id, structuredClone(value));
          return Promise.resolve({ id });
        },
        doc(id) {
          return {
            get() {
              const failed = maybeFail("get");
              if (failed) return failed;
              const value = docsOf(name).get(id);
              return Promise.resolve({ exists: value !== undefined, data: () => structuredClone(value) });
            },
            // options as Firestore's ({ merge: true }); recorded as given.
            set(value, options) {
              writes.push({ op: "set", collection: name, id, value: structuredClone(value), ...(options ? { options } : {}) });
              const failed = maybeFail("set");
              if (failed) return failed;
              const before = docsOf(name).get(id);
              docsOf(name).set(id, options && options.merge ? { ...before, ...structuredClone(value) } : structuredClone(value));
              return Promise.resolve();
            },
            delete() {
              writes.push({ op: "delete", collection: name, id });
              const failed = maybeFail("delete");
              if (failed) return failed;
              docsOf(name).delete(id);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return db;
}

export function fakeAuth(user) {
  return {
    onAuthStateChanged(callback) {
      queueMicrotask(() => callback(user));
      return () => {};
    },
  };
}
