import { describe, expect, it } from "vitest";
import { fakeFirestore } from "../test/fakeFirebase.js";
import { addPost, buildPost, deletePost, fetchPosts, sortPosts } from "./postsStore.js";

describe("buildPost", () => {
  it("has exactly the fields Domain reads, trimmed", () => {
    expect(buildPost({ title: " Title ", body: " Body\n", linkUrl: " https://kis.ac " }, 123)).toEqual({
      title: "Title",
      body: "Body",
      createdAt: 123,
      linkUrl: "https://kis.ac",
    });
  });

  it("leaves linkUrl out entirely when there's no link", () => {
    const post = buildPost({ title: "T", body: "B", linkUrl: "   " }, 1);
    expect(Object.keys(post)).toEqual(["title", "body", "createdAt"]);
  });
});

describe("sortPosts", () => {
  it("puts the newest first, and posts without a date last", () => {
    const sorted = sortPosts([{ id: "a", createdAt: 1 }, { id: "b" }, { id: "c", createdAt: 3 }]);
    expect(sorted.map((post) => post.id)).toEqual(["c", "a", "b"]);
  });
});

describe("Firestore calls", () => {
  it("reads every post with its id", async () => {
    const db = fakeFirestore({ posts: { p1: { title: "A", body: "B", createdAt: 1 } } });
    expect(await fetchPosts(db)).toEqual([{ id: "p1", title: "A", body: "B", createdAt: 1 }]);
    expect(db.writes).toEqual([]);
  });

  it("adds a post as given and deletes only the one asked for", async () => {
    const db = fakeFirestore({ posts: { keep: { title: "Keep", body: "B", createdAt: 1 } } });
    const saved = await addPost(db, { title: "New", body: "B", createdAt: 2 });
    await deletePost(db, saved.id);
    expect(db.writes).toEqual([
      { op: "add", collection: "posts", value: { title: "New", body: "B", createdAt: 2 } },
      { op: "delete", collection: "posts", id: saved.id },
    ]);
    expect([...db.data.posts.keys()]).toEqual(["keep"]);
  });
});
