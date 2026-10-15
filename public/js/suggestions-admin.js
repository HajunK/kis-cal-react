// The Suggestions card on the Assessments page. Kept standalone (no shared.js),
// so it carries its own small date helpers.

function suggestionsFromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatSuggestionDate(iso) {
  return window.formatPreferredDate(suggestionsFromISODate(iso));
}

// lastAddedAt is restamped by each new suggester, so this is the most recent
// suggestion.
function formatSuggestionAddedAt(ms) {
  if (!ms) return "";
  const date = new Date(ms);
  const hours = date.getHours();
  const time = `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return `${window.formatPreferredDate(date)}, ${time}`;
}

let suggestionsInitialized = false;
let allSuggestions = [];

// Live rather than a one-time read, so a student withdrawing a suggestion
// updates the list and counts without a reload.
function watchSuggestions(callback) {
  firebase
    .firestore()
    .collection("suggested")
    .onSnapshot(
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        // Students can only remove their own email, never the doc, so emptied
        // docs are cleared out here.
        docs
          .filter((entry) => (entry.emails || []).length === 0)
          .forEach((entry) =>
            firebase.firestore().collection("suggested").doc(entry.id).delete().catch(() => {})
          );
        allSuggestions = docs.filter((entry) => (entry.emails || []).length > 0);
        if (callback) callback();
      },
      (error) => console.error("Failed to load suggestions:", error)
    );
}

// Added before it's removed from "suggested", so a failure part way never loses
// it. type overrides the suggested type for Monday/Friday summatives (In-Class
// or Testing Block).
function acceptSuggestion(suggestion, type = suggestion.type) {
  const index = allSuggestions.findIndex((entry) => entry.id === suggestion.id);
  if (index !== -1) {
    allSuggestions.splice(index, 1);
    renderSuggestions();
  }

  firebase
    .firestore()
    .collection("assessments")
    .add({
      type,
      date: suggestion.date,
      courseName: suggestion.courseName,
      createdAt: Date.now(),
    })
    .then((ref) => {
      // Pushed into the list directly rather than refetching the whole
      // collection, which would cost a read per assessment.
      if (typeof bumpCacheVersion === "function") bumpCacheVersion("assessments");
      if (typeof adminAllAssessments !== "undefined") {
        adminAllAssessments.push({ id: ref.id, type, date: suggestion.date, courseName: suggestion.courseName });
        renderAdminCalendar();
      }
      return firebase.firestore().collection("suggested").doc(suggestion.id).delete();
    })
    .catch((error) => {
      console.error("Failed to accept suggestion:", error);
      alert("Something went wrong accepting that suggestion. Please try again.");
      if (index !== -1) {
        allSuggestions.splice(index, 0, suggestion);
        renderSuggestions();
      }
    });
}

function declineSuggestion(suggestion) {
  const index = allSuggestions.findIndex((entry) => entry.id === suggestion.id);
  if (index !== -1) {
    allSuggestions.splice(index, 1);
    renderSuggestions();
  }

  firebase
    .firestore()
    .collection("suggested")
    .doc(suggestion.id)
    .delete()
    .catch((error) => {
      console.error("Failed to decline suggestion:", error);
      alert("Something went wrong declining that suggestion. Please try again.");
      if (index !== -1) {
        allSuggestions.splice(index, 0, suggestion);
        renderSuggestions();
      }
    });
}

function buildSuggestionRow(suggestion) {
  const row = document.createElement("div");
  row.className = "suggestions-row";

  const addedEl = document.createElement("span");
  addedEl.className = "suggestions-cell suggestions-cell--added";
  addedEl.textContent = formatSuggestionAddedAt(suggestion.lastAddedAt);

  const dateEl = document.createElement("span");
  dateEl.className = "suggestions-cell suggestions-cell--date";
  dateEl.textContent = formatSuggestionDate(suggestion.date);

  const courseEl = document.createElement("span");
  courseEl.className = "suggestions-cell suggestions-cell--course";
  courseEl.textContent = suggestion.courseName;

  const typeEl = document.createElement("span");
  typeEl.className = "suggestions-cell suggestions-cell--type";
  typeEl.textContent = suggestion.type;

  const emails = suggestion.emails || [];

  const countEl = document.createElement("span");
  countEl.className = "suggestions-cell suggestions-cell--count";
  countEl.textContent = String(emails.length);

  const emailsEl = document.createElement("span");
  emailsEl.className = "suggestions-cell suggestions-cell--emails";
  // The domain is the same for everyone, so it's only noise.
  emailsEl.textContent = emails.map((email) => email.split("@")[0]).join(", ");

  const actions = document.createElement("div");
  actions.className = "suggestions-cell suggestions-cell--actions";

  const acceptButton = (label, type) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestions-accept-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => acceptSuggestion(suggestion, type));
    return btn;
  };
  // A summative on a day with a Testing Block could be in class or in the
  // Testing Block, so the admin picks.
  const acceptBtns =
    suggestion.type === "Summative" && adminDayHasTestingBlock(suggestion.date)
      ? [acceptButton("In-Class", "In-Class"), acceptButton("Testing Block", "Testing Block")]
      : [acceptButton("Accept")];

  const declineBtn = document.createElement("button");
  declineBtn.type = "button";
  declineBtn.className = "suggestions-decline-btn";
  declineBtn.textContent = "Decline";
  declineBtn.addEventListener("click", () => declineSuggestion(suggestion));

  actions.append(...acceptBtns, declineBtn);
  row.append(addedEl, dateEl, courseEl, typeEl, countEl, emailsEl, actions);
  return row;
}

function renderSuggestions() {
  const loading = document.getElementById("suggestions-loading");
  const empty = document.getElementById("suggestions-empty");
  const list = document.getElementById("suggestions-list");
  const rows = document.getElementById("suggestions-rows");

  loading.hidden = true;
  rows.innerHTML = "";

  const count = document.getElementById("suggestions-count");
  if (count) {
    count.textContent = String(allSuggestions.length);
    count.hidden = allSuggestions.length === 0;
  }

  if (allSuggestions.length === 0) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;

  // Soonest first, since those matter most.
  allSuggestions
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .forEach((suggestion) => rows.appendChild(buildSuggestionRow(suggestion)));
}

function initSuggestionsPage() {
  watchSuggestions(renderSuggestions);
}

// Dates are formatted at render time, so a Date format change needs a re-
// render.
window.addEventListener("app:preferences-changed", () => {
  if (suggestionsInitialized) renderSuggestions();
});

// Cosmetic only: firestore.rules is the real gate.
function handleSuggestionsAuthState(user) {
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  document.getElementById("suggestions-layout").hidden = !isAdmin;

  if (isAdmin && !suggestionsInitialized) {
    suggestionsInitialized = true;
    initSuggestionsPage();
  }
}

auth.onAuthStateChanged(handleSuggestionsAuthState);
