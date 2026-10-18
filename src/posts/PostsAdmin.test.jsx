// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuth, fakeFirestore } from "../test/fakeFirebase.js";
import { ToastProvider } from "../ui/Toast.jsx";
import { PostsAdmin } from "./PostsAdmin.jsx";

const ADMIN = { email: "hajunk105@gmail.com" };
const EXISTING = {
  old: { title: "Older post", body: "Old body", createdAt: 1 },
  new: { title: "Newer post", body: "New body", createdAt: 2, linkUrl: "https://kis.ac" },
};

function renderPage({ user = ADMIN, posts = EXISTING } = {}) {
  const db = fakeFirestore({ posts });
  render(
    <ToastProvider>
      <PostsAdmin auth={fakeAuth(user)} db={db} />
    </ToastProvider>
  );
  return db;
}

const postTitles = () => screen.queryAllByRole("listitem").map((item) => item.querySelector(".posts-entry-title").textContent);

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PostsAdmin", () => {
  it("shows nothing until sign-in is known, then turns away non-admins without reading", async () => {
    const db = renderPage({ user: { email: "student@kis.ac" } });
    expect(await screen.findByText("This page is for admins only.")).toBeTruthy();
    expect(screen.queryByText("Posts")).toBe(null);
    expect(db.writes).toEqual([]);
  });

  it("turns away a signed-out visitor", async () => {
    renderPage({ user: null });
    expect(await screen.findByText("This page is for admins only.")).toBeTruthy();
  });

  it("lists posts newest first, with their links", async () => {
    renderPage();
    await waitFor(() => expect(postTitles()).toEqual(["Newer post", "Older post"]));
    expect(screen.getByRole("link", { name: "https://kis.ac" }).getAttribute("href")).toBe("https://kis.ac");
  });

  it("says when there's nothing posted", async () => {
    renderPage({ posts: {} });
    expect(await screen.findByText("Nothing posted yet.")).toBeTruthy();
  });

  it("adds a post with exactly the fields Domain reads", async () => {
    const user = userEvent.setup();
    const db = renderPage({ posts: {} });
    await screen.findByText("Nothing posted yet.");
    vi.spyOn(Date, "now").mockReturnValue(1000);

    await user.type(screen.getByLabelText("Title"), "  Exam week ");
    await user.type(screen.getByLabelText("Body"), "Good luck!");
    await user.click(screen.getByRole("button", { name: "Add Post" }));

    await waitFor(() => expect(postTitles()).toEqual(["Exam week"]));
    expect(db.writes).toEqual([
      { op: "add", collection: "posts", value: { title: "Exam week", body: "Good luck!", createdAt: 1000 } },
    ]);
    expect(screen.getByLabelText("Title").value).toBe("");
  });

  it("refuses a post without a body, writing nothing", async () => {
    const user = userEvent.setup();
    const db = renderPage({ posts: {} });
    await screen.findByText("Nothing posted yet.");
    await user.type(screen.getByLabelText("Title"), "Only a title");
    await user.click(screen.getByRole("button", { name: "Add Post" }));
    expect(await screen.findByText("A post needs both a title and a body.")).toBeTruthy();
    expect(db.writes).toEqual([]);
  });

  it("keeps what was typed when adding fails", async () => {
    const user = userEvent.setup();
    const db = renderPage({ posts: {} });
    await screen.findByText("Nothing posted yet.");
    db.failNext("add");
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Body"), "B");
    await user.click(screen.getByRole("button", { name: "Add Post" }));
    expect(await screen.findByText("Something went wrong adding that post. Please try again.")).toBeTruthy();
    expect(screen.getByLabelText("Title").value).toBe("T");
    expect(postTitles()).toEqual([]);
  });

  it("deletes only after confirming, and only that post", async () => {
    const user = userEvent.setup();
    const db = renderPage();
    await waitFor(() => expect(postTitles()).toHaveLength(2));

    const older = screen.getAllByRole("listitem")[1];
    await user.click(within(older).getByRole("button", { name: "Delete post" }));
    expect(db.writes).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "Delete this post?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete post" }));

    expect(db.writes).toEqual([{ op: "delete", collection: "posts", id: "old" }]);
    await waitFor(() => expect(postTitles()).toEqual(["Newer post"]));
  });

  it("deletes nothing when the confirm is cancelled", async () => {
    const user = userEvent.setup();
    const db = renderPage();
    await waitFor(() => expect(postTitles()).toHaveLength(2));
    await user.click(screen.getAllByRole("button", { name: "Delete post" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(db.writes).toEqual([]);
    expect(postTitles()).toHaveLength(2);
  });

  it("puts a post back when deleting it fails", async () => {
    const user = userEvent.setup();
    const db = renderPage();
    await waitFor(() => expect(postTitles()).toHaveLength(2));
    db.failNext("delete");
    await user.click(screen.getAllByRole("button", { name: "Delete post" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete post" }));
    expect(await screen.findByText("Something went wrong deleting that post. Please try again.")).toBeTruthy();
    expect(postTitles()).toEqual(["Newer post", "Older post"]);
  });

  it("says when the posts couldn't load", async () => {
    const db = fakeFirestore();
    db.failNext("get");
    render(
      <ToastProvider>
        <PostsAdmin auth={fakeAuth(ADMIN)} db={db} />
      </ToastProvider>
    );
    expect(await screen.findByText("Something went wrong loading posts. Please refresh the page.")).toBeTruthy();
    await act(async () => {});
  });
});
