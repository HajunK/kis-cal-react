// The admin's editor for one guide, in a dialog: its details, a picture for its
// card, and its text (Markdown) with pictures that go up to Storage from here.
import { deleteGuide, deleteImages, loadGuide, saveGuide, uploadImage } from "./data.js";
import { keyProblem, normalizeKey } from "./guides.js";
import { prepareBodyImage, prepareThumbnail } from "./images.js";

const KNOWN_ERRORS = [
  [/permission-denied|unauthorized|unauthenticated/i, "You don't have permission to do that. Sign in with an admin account."],
  [/bucket-not-found|storage\/unknown|object-not-found/i, "Image storage isn't set up yet. Create the bucket in the Firebase console first."],
  [/canceled|network|retry-limit/i, "The connection dropped. Check it and try again."],
];
const friendly = (error) => {
  const text = `${error && error.code} ${error && error.message}`;
  const known = KNOWN_ERRORS.find(([pattern]) => pattern.test(text));
  return known ? known[1] : "Couldn't save that. Try again.";
};

// guide: the guide to change, or null for a new one. onSaved(guide) and
// onDeleted(guide) run after the change has gone through.
export function openEditor({ guide = null, onSaved = () => {}, onDeleted = () => {} }) {
  const dialog = document.createElement("dialog");
  dialog.className = "editor";
  dialog.innerHTML = `
    <form novalidate>
      <h2></h2>
      <div class="field">
        <label for="ed-key">Key</label>
        <div class="key-input"><span aria-hidden="true">guides.kiscal.app/</span><input id="ed-key" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="biology" /></div>
        <p class="hint" data-key-hint></p>
      </div>
      <div class="field"><label for="ed-title">Title</label><input id="ed-title" type="text" maxlength="120" autocomplete="off" /></div>
      <div class="row">
        <div class="field"><label for="ed-course">Course</label><input id="ed-course" type="text" maxlength="60" autocomplete="off" placeholder="AP Biology" /></div>
        <div class="field"><label for="ed-test">Test</label><input id="ed-test" type="text" maxlength="60" autocomplete="off" placeholder="Unit 3 test" /></div>
      </div>
      <div class="field"><label for="ed-minutes">Read time (minutes)</label><input id="ed-minutes" type="number" min="0" max="240" step="1" /></div>
      <div class="field">
        <span class="label">Card picture</span>
        <div class="thumb-picker">
          <img class="preview" alt="" />
          <div>
            <input id="ed-thumb" type="file" accept="image/*" hidden />
            <button type="button" class="button" data-pick-thumb>Choose picture</button>
            <button type="button" class="button button--danger" data-remove-thumb hidden>Remove</button>
            <p class="hint">Shown at 16:9, so the middle of the picture is kept. Without one the card shows a plain tile with the course's initials.</p>
          </div>
        </div>
      </div>
      <div class="field">
        <label for="ed-body">Guide text</label>
        <textarea id="ed-body" spellcheck="true"></textarea>
        <div class="actions">
          <input id="ed-image" type="file" accept="image/*" hidden />
          <button type="button" class="button" data-add-image>Add image</button>
          <span class="hint">Markdown: # Heading, **bold**, - list, [link](https://…). An added image is put in at the cursor.</span>
        </div>
      </div>
      <label class="check"><input id="ed-published" type="checkbox" /> Published (visible to everyone)</label>
      <p class="error" role="alert"></p>
      <div class="actions actions--pinned">
        <button type="button" class="button button--danger" data-delete hidden>Delete guide</button>
        <span class="spacer"></span>
        <button type="button" class="button" data-cancel>Cancel</button>
        <button type="submit" class="button button--primary" data-save>Save</button>
      </div>
    </form>`;
  const $ = (selector) => dialog.querySelector(selector);

  $("h2").textContent = guide ? "Edit guide" : "New guide";
  // A guide's key is its address and can't change once it exists.
  $("#ed-key").value = guide?.id || "";
  $("#ed-key").disabled = Boolean(guide);
  $("[data-key-hint]").textContent = guide
    ? "The key is the guide's address and can't be changed."
    : "The guide's address: lowercase letters, numbers and hyphens, like ap-bio-unit-3. It can't be changed later.";
  $("#ed-title").value = guide?.title || "";
  $("#ed-course").value = guide?.course || "";
  $("#ed-test").value = guide?.test || "";
  $("#ed-minutes").value = guide?.minutes || "";
  $("#ed-body").value = guide?.body || "";
  $("#ed-published").checked = guide ? Boolean(guide.published) : false;
  $("[data-delete]").hidden = !guide;

  const keyOf = () => (guide ? guide.id : normalizeKey($("#ed-key").value));
  let pendingThumb = null; // a picked picture, not yet uploaded
  let removeThumb = false;
  let previewUrl = null;
  const sessionImages = []; // body pictures uploaded in this editing session
  let saved = false;

  const showThumb = () => {
    const shown = pendingThumb ? previewUrl : removeThumb ? "" : guide?.thumbnailUrl || "";
    if (shown) $(".preview").setAttribute("src", shown);
    else $(".preview").removeAttribute("src");
    $("[data-remove-thumb]").hidden = !shown;
  };
  showThumb();

  const setBusy = (busy) => dialog.querySelectorAll("button, input, select, textarea").forEach((control) => (control.disabled = busy));
  const fail = (error) => {
    console.error("Guides editor:", error);
    $(".error").textContent = friendly(error);
  };

  // The key is lowercase, so it's shown that way as it's typed.
  $("#ed-key").addEventListener("input", (event) => {
    const field = event.target;
    const at = field.selectionStart;
    field.value = field.value.toLowerCase();
    field.setSelectionRange(at, at);
  });

  $("[data-pick-thumb]").addEventListener("click", () => $("#ed-thumb").click());
  $("#ed-thumb").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    $(".error").textContent = "";
    try {
      pendingThumb = await prepareThumbnail(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(pendingThumb);
      removeThumb = false;
      showThumb();
    } catch (error) {
      $(".error").textContent = "That file isn't an image this browser can read.";
    }
  });
  $("[data-remove-thumb]").addEventListener("click", () => {
    pendingThumb = null;
    removeThumb = true;
    showThumb();
  });

  $("[data-add-image]").addEventListener("click", () => $("#ed-image").click());
  $("#ed-image").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const problem = guide ? null : keyProblem($("#ed-key").value);
    if (problem) {
      // Its pictures are kept under the key, so it comes first.
      $(".error").textContent = `Set the key before adding images. ${problem}`;
      $("#ed-key").focus();
      return;
    }
    $(".error").textContent = "";
    setBusy(true);
    try {
      const image = await uploadImage(keyOf(), await prepareBodyImage(file), "img");
      sessionImages.push(image.path);
      const body = $("#ed-body");
      const at = body.selectionStart ?? body.value.length;
      const markdown = `\n![Describe this image](${image.url})\n`;
      body.value = body.value.slice(0, at) + markdown + body.value.slice(body.selectionEnd ?? at);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  });

  const close = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dialog.close();
  };
  $("[data-cancel]").addEventListener("click", close);
  // However it closes, pictures uploaded here and never saved are cleaned up.
  dialog.addEventListener("close", () => {
    if (!saved) deleteImages(sessionImages);
    dialog.remove();
  });

  $("[data-delete]").addEventListener("click", async () => {
    if (!window.confirm(`Delete "${guide.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteGuide(guide);
      saved = true;
      close();
      onDeleted(guide);
    } catch (error) {
      fail(error);
      setBusy(false);
    }
  });

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const problem = guide ? null : keyProblem($("#ed-key").value);
    if (problem) {
      $(".error").textContent = problem;
      $("#ed-key").focus();
      return;
    }
    const title = $("#ed-title").value.trim();
    const course = $("#ed-course").value.trim();
    if (!title || !course) {
      $(".error").textContent = "Give the guide a title and a course.";
      return;
    }
    $(".error").textContent = "";
    setBusy(true);
    try {
      const id = keyOf();
      // A new guide can't take a key another guide already has.
      if (!guide && (await loadGuide(id))) {
        $(".error").textContent = `A guide with the key "${id}" already exists. Choose another key.`;
        setBusy(false);
        $("#ed-key").focus();
        return;
      }
      let { thumbnailUrl = "", thumbnailPath = "" } = guide || {};
      const unused = [];
      if (pendingThumb || removeThumb) {
        if (thumbnailPath) unused.push(thumbnailPath);
        thumbnailUrl = "";
        thumbnailPath = "";
      }
      if (pendingThumb) {
        const uploaded = await uploadImage(id, pendingThumb, "thumb");
        thumbnailUrl = uploaded.url;
        thumbnailPath = uploaded.path;
      }
      // Body pictures the text still uses are kept; the rest go.
      const body = $("#ed-body").value;
      const bodyImages = [...(guide?.imagePaths || []), ...sessionImages];
      const inUse = (path) => body.includes(encodeURIComponent(path));
      const now = Date.now();
      const next = {
        id,
        title,
        course,
        test: $("#ed-test").value.trim(),
        minutes: Math.max(0, Math.round(Number($("#ed-minutes").value) || 0)),
        body,
        published: $("#ed-published").checked,
        thumbnailUrl,
        thumbnailPath,
        imagePaths: bodyImages.filter(inUse),
        createdAt: guide?.createdAt || now,
        updatedAt: now,
      };
      await saveGuide(next);
      saved = true;
      await deleteImages([...unused, ...bodyImages.filter((path) => !inUse(path))]);
      close();
      onSaved(next);
    } catch (error) {
      fail(error);
      setBusy(false);
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  $("#ed-title").focus();
}
