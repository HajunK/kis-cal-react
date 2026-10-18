import { useEffect, useRef, useState } from "react";
import { isAdminEmail } from "../core/admins.js";
import { ConfirmDialog } from "../ui/ConfirmDialog.jsx";
import { Field, SubmitButton, TextArea, TextInput } from "../ui/Field.jsx";
import { useToast } from "../ui/Toast.jsx";
import { addPost, buildPost, deletePost, fetchPosts, sortPosts } from "./postsStore.js";

// The Posts admin page: the posts shown under Domain's cards, newest first,
// each deletable, and a form to add one. auth and db are Firebase's (see
// main.jsx). Admin-only here as a courtesy; firestore.rules is the real gate.
export function PostsAdmin({ auth, db }) {
  // undefined until Firebase has restored the session.
  const [user, setUser] = useState(undefined);
  useEffect(() => auth.onAuthStateChanged((next) => setUser(next)), [auth]);

  if (user === undefined) return null;
  if (!isAdminEmail(user && user.email)) {
    return <p className="admin-not-authorized">This page is for admins only.</p>;
  }
  return <PostsPanel db={db} />;
}

function PostsPanel({ db }) {
  const showToast = useToast();
  // null while loading.
  const [posts, setPosts] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    let current = true;
    fetchPosts(db)
      .then((fetched) => current && setPosts(fetched))
      .catch((error) => {
        // The usual cause is the posts rule not being deployed yet.
        console.error("Failed to load posts:", error);
        if (current) setLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [db]);

  const added = (post) => setPosts((list) => [...(list || []), post]);

  // Gone from the list at once; put back where it was if the delete fails.
  const confirmDelete = () => {
    const post = pendingDelete;
    setPendingDelete(null);
    const index = posts.findIndex((entry) => entry.id === post.id);
    setPosts((list) => list.filter((entry) => entry.id !== post.id));
    deletePost(db, post.id).catch((error) => {
      console.error("Failed to delete post:", error);
      showToast("Something went wrong deleting that post. Please try again.");
      setPosts((list) => (list.some((entry) => entry.id === post.id) ? list : [...list.slice(0, index), post, ...list.slice(index)]));
    });
  };

  const loading = posts === null && !loadFailed;
  const empty = loadFailed || (posts !== null && posts.length === 0);

  return (
    <div className="admin-day-panel posts-admin-panel">
      <div className="admin-day-panel-header">
        <h2 className="admin-day-panel-title">Posts</h2>
      </div>

      {loading && (
        <div className="assessment-calendar-loading">
          <span className="assessment-calendar-spinner" />
        </div>
      )}

      {empty && (
        <p className="posts-empty">
          {loadFailed ? "Something went wrong loading posts. Please refresh the page." : "Nothing posted yet."}
        </p>
      )}

      {posts !== null && posts.length > 0 && (
        <ul className="admin-day-entry-list">
          {sortPosts(posts).map((post) => (
            <PostEntry key={post.id} post={post} onDelete={() => setPendingDelete(post)} />
          ))}
        </ul>
      )}

      <PostForm db={db} onAdded={added} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this post?"
        message={
          pendingDelete ? `"${pendingDelete.title}" will be removed from everyone's Domain tab. This can't be undone.` : ""
        }
        confirmLabel="Delete post"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function PostEntry({ post, onDelete }) {
  return (
    <li className="posts-entry">
      <div className="posts-entry-content">
        <span className="posts-entry-title">{post.title}</span>
        <p className="posts-entry-body">{post.body}</p>
        {post.linkUrl && (
          <a className="posts-entry-link" href={post.linkUrl} target="_blank" rel="noopener noreferrer">
            {post.linkUrl}
          </a>
        )}
      </div>
      <button type="button" className="admin-day-entry-delete" aria-label="Delete post" onClick={onDelete}>
        ×
      </button>
    </li>
  );
}

function PostForm({ db, onAdded }) {
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  // So a double click can't post the same thing twice.
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    const post = buildPost({ title, body, linkUrl });
    if (!post.title || !post.body) {
      showToast("A post needs both a title and a body.");
      return;
    }
    setSaving(true);
    addPost(db, post)
      .then((saved) => {
        onAdded(saved);
        setTitle("");
        setBody("");
        setLinkUrl("");
        titleRef.current?.focus();
      })
      .catch((error) => {
        console.error("Failed to add post:", error);
        showToast("Something went wrong adding that post. Please try again.");
      })
      .finally(() => setSaving(false));
  };

  return (
    <form className="admin-add-form" onSubmit={submit}>
      <Field label="Title">
        <TextInput ref={titleRef} placeholder="Post title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Body">
        <TextArea placeholder="What do you want to say?" value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <Field label="Link URL (optional)">
        <TextInput type="url" placeholder="https://..." value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
      </Field>
      <SubmitButton disabled={saving}>Add Post</SubmitButton>
    </form>
  );
}
