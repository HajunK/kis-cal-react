// The posts collection. Each doc is { title, body, createdAt, linkUrl? }:
// the shape Domain's posts (fetchDomainPosts in domain.js) read, and what
// every existing post has, so it mustn't change. db is a Firestore instance.

const POSTS = "posts";

// linkUrl is left out entirely when empty, as it always has been.
export function buildPost({ title, body, linkUrl = "" }, now = Date.now()) {
  const post = { title: title.trim(), body: body.trim(), createdAt: now };
  const link = linkUrl.trim();
  if (link) post.linkUrl = link;
  return post;
}

// Newest first, as on Domain.
export function sortPosts(posts) {
  return posts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function fetchPosts(db) {
  return db
    .collection(POSTS)
    .get()
    .then((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

// Resolves to the post with its new id.
export function addPost(db, post) {
  return db
    .collection(POSTS)
    .add(post)
    .then((ref) => ({ id: ref.id, ...post }));
}

export function deletePost(db, id) {
  return db.collection(POSTS).doc(id).delete();
}
