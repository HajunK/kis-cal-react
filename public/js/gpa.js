
function loadDomainSnapshot() {
  return appData.domainSnapshot;
}

const GPA_SCALE = {
  "a-plus": 4.0,
  a: 4.0,
  "a-minus": 3.667,
  "b-plus": 3.333,
  b: 3.0,
  "b-minus": 2.667,
  "c-plus": 2.333,
  c: 2.0,
  "c-minus": 1.667,
  "d-plus": 1.333,
  d: 1.0,
  "d-minus": 0.667,
  f: 0.0,
};

function loadGpaClasses() {
  return appData.gpaClasses;
}

const GPA_DROPDOWN_ANIMATION_MS = 180;

// The pending empty is cancelled if it reopens mid-close, so it can't wipe the
// new options.
function closeAllGpaDropdowns() {
  document.querySelectorAll(".gpa-grade-dropdown--visible").forEach((dropdown) => {
    dropdown.classList.remove("gpa-grade-dropdown--visible");
    dropdown._closeTimer = setTimeout(() => {
      dropdown.innerHTML = "";
      dropdown._closeTimer = null;
    }, GPA_DROPDOWN_ANIMATION_MS);
  });
}

function openGpaDropdown(dropdown) {
  clearTimeout(dropdown._closeTimer);
  void dropdown.offsetWidth;  // so the entrance transitions
  dropdown.classList.add("gpa-grade-dropdown--visible");
}

function createGpaBadgeContent(slug, label) {
  if (!slug) {
    const span = document.createElement("span");
    span.className = "grade-badge--empty";
    return span;
  }
  const img = document.createElement("img");
  img.className = "letter-grade";
  img.src = gradeIconPath(slug);
  img.dataset.slug = slug;
  img.alt = label || "";
  return img;
}

function setGpaRowGrade(row, slug, label) {
  row.dataset.slug = slug || "";
  row.dataset.label = label || "";
  const btn = row.querySelector(".gpa-grade-badge-btn");
  btn.innerHTML = "";
  btn.appendChild(createGpaBadgeContent(slug, label));
}

const GPA_BADGE_TRANSITION_MS = 180;
const GPA_BADGE_FLIP_HALF_MS = 130;

// The grade swaps while the badge is edge-on and invisible, like a coin flip.
function flipGpaBadge(row, slug, label) {
  const btn = row.querySelector(".gpa-grade-badge-btn");
  if (!btn.animate) {
    setGpaRowGrade(row, slug, label);
    return;
  }
  if (btn._gpaFlip) btn._gpaFlip.cancel();
  // Recorded now so a save right after the pick stores the new grade.
  row.dataset.slug = slug || "";
  row.dataset.label = label || "";
  row.classList.add("gpa-class-row--flipping");

  const turnAway = btn.animate(
    [{ transform: "perspective(240px) rotateY(0deg)" }, { transform: "perspective(240px) rotateY(90deg)" }],
    { duration: GPA_BADGE_FLIP_HALF_MS, easing: "ease-in" }
  );
  btn._gpaFlip = turnAway;
  turnAway.onfinish = () => {
    setGpaRowGrade(row, slug, label);
    btn._gpaFlip = btn.animate(
      [{ transform: "perspective(240px) rotateY(-90deg)" }, { transform: "perspective(240px) rotateY(0deg)" }],
      { duration: GPA_BADGE_FLIP_HALF_MS, easing: "ease-out" }
    );
    btn._gpaFlip.onfinish = () => row.classList.remove("gpa-class-row--flipping");
  };
}

function animateGpaBadgeChange(row, slug, label, direction) {
  const btn = row.querySelector(".gpa-grade-badge-btn");

  // Fast scrolling can call this before the last transition's cleanup; the
  // incoming icon becomes the new starting point.
  if (btn._gpaBadgeCleanup) {
    clearTimeout(btn._gpaBadgeCleanup);
    btn._gpaBadgeCleanup = null;
  }
  while (btn.children.length > 1) btn.firstElementChild.remove();

  const oldContent = btn.firstElementChild;
  const newContent = createGpaBadgeContent(slug, label);

  row.dataset.slug = slug || "";
  row.dataset.label = label || "";

  const exitY = direction > 0 ? "-10px" : "10px";
  const enterY = direction > 0 ? "10px" : "-10px";

  newContent.style.position = "absolute";
  newContent.style.inset = "0";
  newContent.style.opacity = "0";
  newContent.style.transform = `translateY(${enterY})`;
  newContent.style.transition = "none";
  btn.appendChild(newContent);

  // Without inset: 0 it drifts diagonally instead of straight up or down.
  if (oldContent) {
    oldContent.style.position = "absolute";
    oldContent.style.inset = "0";
  }

  void btn.offsetWidth;  // so the "none" transition applies first

  const easing = `transform ${GPA_BADGE_TRANSITION_MS}ms ease, opacity ${GPA_BADGE_TRANSITION_MS}ms ease`;
  newContent.style.transition = easing;
  newContent.style.opacity = "1";
  newContent.style.transform = "translateY(0)";

  if (oldContent) {
    oldContent.style.transition = easing;
    oldContent.style.opacity = "0";
    oldContent.style.transform = `translateY(${exitY})`;
  }

  btn._gpaBadgeCleanup = setTimeout(() => {
    if (oldContent) oldContent.remove();
    newContent.style.position = "";
    newContent.style.inset = "";
    newContent.style.transition = "";
    newContent.style.transform = "";
    newContent.style.opacity = "";
    btn._gpaBadgeCleanup = null;
  }, GPA_BADGE_TRANSITION_MS + 30);
}

function renderGpaDropdownOptions(dropdown, selectedSlug, onSelect) {
  dropdown.innerHTML = "";
  // The grid scrolls inside the dropdown so the pointer sticking out of its
  // edge isn't clipped.
  const grid = document.createElement("ul");
  grid.className = "gpa-grade-grid";

  GRADE_SCALE.forEach((tier) => {
    const optionItem = document.createElement("li");
    const optionBtn = document.createElement("button");
    optionBtn.type = "button";
    optionBtn.className = "gpa-grade-option";
    if (tier.slug === selectedSlug) optionBtn.classList.add("gpa-grade-option--selected");

    const img = document.createElement("img");
    img.src = gradeIconPath(tier.slug);
    img.dataset.slug = tier.slug;
    img.alt = tier.label;
    optionBtn.appendChild(img);

    optionBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(tier);
    });

    optionItem.appendChild(optionBtn);
    grid.appendChild(optionItem);
  });

  dropdown.appendChild(grid);

  // Otherwise a grade below the fold would open out of sight.
  const selected = grid.querySelector(".gpa-grade-option--selected");
  if (selected) {
    const item = selected.parentElement;
    if (item.offsetTop + item.offsetHeight > grid.clientHeight) grid.scrollTop = item.offsetTop - grid.clientHeight / 2 + item.offsetHeight / 2;
  }
}

function persistGpaClasses() {
  const list = document.querySelector(".gpa-class-list");
  if (!list) return;
  const classes = Array.from(list.querySelectorAll(".gpa-class-row")).map((row) => ({
    name: row.querySelector(".gpa-class-name").textContent,
    slug: row.dataset.slug || null,
    label: row.dataset.label || null,
  }));
  appData.gpaClasses = classes;
  pushDataToCloud();
}

// Restoring on page load shouldn't animate; only live changes after the first
// build do.
let gpaSettled = false;

function recalculateGpa() {
  const list = document.querySelector(".gpa-class-list");
  if (!list) return;

  let unweightedSum = 0;
  let weightedSum = 0;
  let creditTotal = 0;
  let hasAp = false;

  list.querySelectorAll(".gpa-class-row").forEach((row) => {
    const name = row.querySelector(".gpa-class-name").textContent;
    const course = findCourseCatalogEntry(name);
    const isAp = course ? course.ap : false;
    // Taking an AP course decides the display, graded or not.
    if (isAp) hasAp = true;

    const points = GPA_SCALE[row.dataset.slug];
    if (points === undefined) return;

    // Catalog weight can lower credit (half for each part of a combo course) or
    // zero it (Lunch).
    const credit = course ? course.weight : 1;
    if (credit === 0) return;

    unweightedSum += points * credit;
    weightedSum += (points + (isAp ? 1.0 : 0)) * credit;
    creditTotal += credit;
  });

  const unweightedText = creditTotal > 0 ? roundToFourDecimals(unweightedSum / creditTotal) : "-";
  const weightedText = creditTotal > 0 ? roundToFourDecimals(weightedSum / creditTotal) : "-";

  const splitItems = document.querySelectorAll(".gpa-summary-item:not(.gpa-summary-item--combined)");
  const combinedItem = document.querySelector(".gpa-summary-item--combined");

  splitItems.forEach((el) => {
    el.hidden = !hasAp;
  });
  if (combinedItem) combinedItem.hidden = hasAp;

  const revealStyle = gpaSettled ? "blur" : "instant";
  if (hasAp) {
    const unweightedEl = document.querySelector(".gpa-unweighted");
    const weightedEl = document.querySelector(".gpa-weighted");
    if (unweightedEl) animateNumberChange(unweightedEl, unweightedText, revealStyle);
    if (weightedEl) animateNumberChange(weightedEl, weightedText, revealStyle);
  } else {
    const combinedEl = document.querySelector(".gpa-combined");
    if (combinedEl) animateNumberChange(combinedEl, unweightedText, revealStyle);
  }
}

function renderGpaClassList(classes) {
  const list = document.querySelector(".gpa-class-list");
  if (!list) return;
  list.innerHTML = "";

  classes.forEach(({ name, slug, label }) => {
    const row = document.createElement("li");
    row.className = "gpa-class-row";

    const nameEl = document.createElement("span");
    nameEl.className = "gpa-class-name";
    nameEl.textContent = name;

    const badgeBtn = document.createElement("button");
    badgeBtn.type = "button";
    badgeBtn.className = "gpa-grade-badge-btn";

    const dropdown = document.createElement("div");
    dropdown.className = "gpa-grade-dropdown";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "gpa-clear-btn";
    clearBtn.innerHTML = '<span class="close-icon" aria-hidden="true"></span>';
    clearBtn.setAttribute("aria-label", "Remove grade");
    clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      flipGpaBadge(row, null, null);
      closeAllGpaDropdowns();
      persistGpaClasses();
      recalculateGpa();
      // Clearing doesn't count toward hiding the instructions; only picking a
      // grade does.
      list.dispatchEvent(new CustomEvent("gpa-grade-changed", { bubbles: true, detail: { cleared: true } }));
    });

    row.appendChild(nameEl);
    row.appendChild(badgeBtn);
    row.appendChild(clearBtn);
    row.appendChild(dropdown);
    list.appendChild(row);

    setGpaRowGrade(row, slug, label);

    badgeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = dropdown.classList.contains("gpa-grade-dropdown--visible");
      closeAllGpaDropdowns();
      if (wasOpen) return;

      renderGpaDropdownOptions(dropdown, row.dataset.slug, (tier) => {
        flipGpaBadge(row, tier.slug, tier.label);
        closeAllGpaDropdowns();
        persistGpaClasses();
        recalculateGpa();
        list.dispatchEvent(new CustomEvent("gpa-grade-changed", { bubbles: true }));
      });
      openGpaDropdown(dropdown);
    });

    // Trackpads fire many tiny events per gesture; the threshold and cooldown
    // make one flick move one tier.
    let wheelAccum = 0;
    let wheelCooldownUntil = 0;
    const WHEEL_STEP_THRESHOLD = 40;
    const WHEEL_COOLDOWN_MS = 120;

    badgeBtn.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        closeAllGpaDropdowns();

        const now = performance.now();
        wheelAccum += event.deltaY;
        if (now < wheelCooldownUntil || Math.abs(wheelAccum) < WHEEL_STEP_THRESHOLD) return;

        const direction = wheelAccum > 0 ? 1 : -1;
        wheelAccum = 0;
        wheelCooldownUntil = now + WHEEL_COOLDOWN_MS;

        const currentIndex = row.dataset.slug ? GRADE_SCALE.findIndex((tier) => tier.slug === row.dataset.slug) : -1;
        const nextIndex =
          currentIndex === -1 ? 0 : Math.min(Math.max(currentIndex + direction, 0), GRADE_SCALE.length - 1);
        if (nextIndex === currentIndex) return;

        const tier = GRADE_SCALE[nextIndex];
        animateGpaBadgeChange(row, tier.slug, tier.label, direction);
        persistGpaClasses();
        recalculateGpa();
        list.dispatchEvent(new CustomEvent("gpa-grade-changed", { bubbles: true, detail: { fromScroll: true } }));
      },
      { passive: false }
    );
  });

  recalculateGpa();
  gpaSettled = true;
}

// Combo courses are split into their parts here, since each part has its own
// grade.
function currentClassNames() {
  const names = loadPeriods()
    .map((name) => (name || "").trim())
    .filter((name) => name !== "");
  return expandCourseNames(names);
}

// A saved grade wins so a manual override survives a reload.
function buildGpaClasses() {
  const domainSnapshot = loadDomainSnapshot();
  const existing = loadGpaClasses();

  return currentClassNames().map((name) => {
    const remembered = existing.find((c) => c.name === name);
    if (remembered) return remembered;

    const fromDomain = domainSnapshot.find((c) => c.name === name);
    return fromDomain || { name, slug: null, label: null };
  });
}

function hideGpaClassesDescription(el) {
  const startHeight = el.getBoundingClientRect().height;
  el.style.height = `${startHeight}px`;
  void el.offsetHeight;  // so the height applies before transitioning
  el.style.transition = "height 0.25s ease, margin-bottom 0.25s ease, opacity 0.25s ease";
  el.style.height = "0px";
  el.style.marginBottom = "0px";
  el.style.opacity = "0";
  el.addEventListener("transitionend", () => { el.hidden = true; }, { once: true });
}

// A no-op on other pages.
function initGpaPage() {
  const gpaClassList = document.querySelector(".gpa-class-list");
  if (!gpaClassList) return;

  renderGpaClassList(buildGpaClasses());
  persistGpaClasses();

  document.addEventListener("click", closeAllGpaDropdowns);

  // In memory only, so the instructions return on the next page load.
  const gpaDescription = document.querySelector(".gpa-classes-description");
  if (gpaDescription) {
    const onGpaGradeChanged = (event) => {
      if (event.detail && (event.detail.cleared || event.detail.fromScroll)) return;
      document.removeEventListener("gpa-grade-changed", onGpaGradeChanged);
      hideGpaClassesDescription(gpaDescription);
    };
    document.addEventListener("gpa-grade-changed", onGpaGradeChanged);
  }

  // appData.domainSnapshot could be stale (edited in another tab), so this
  // fetches the latest from Firestore.
  const gpaPasteBtn = document.querySelector(".gpa-paste-btn");
  if (gpaPasteBtn) {
    const pasteBtnDefaultLabel = gpaPasteBtn.textContent;
    const MIN_PASTE_LOADING_MS = 1000; // so it doesn't just flash by, even on a fast fetch

    const setPasteLoading = (loading) => {
      gpaPasteBtn.disabled = loading;
      if (!loading) return;
      gpaPasteBtn.innerHTML = "";
      const spinner = document.createElement("span");
      spinner.className = "paste-spinner";
      gpaPasteBtn.appendChild(spinner);
      gpaPasteBtn.appendChild(document.createTextNode("Pasting letter grades..."));
    };

    const resetPasteLabel = () => {
      gpaPasteBtn.textContent = pasteBtnDefaultLabel;
      gpaPasteBtn.disabled = false;
    };
    document.addEventListener("gpa-grade-changed", resetPasteLabel);

    const PASTE_FLIP_STAGGER_MS = 70;

    // The grades and GPA switch at once; only the badges trail behind, for
    // effect.
    const applyDomainSnapshotPaste = (domainSnapshot) => {
      const previous = new Map(
        Array.from(document.querySelectorAll(".gpa-class-row")).map((row) => [
          row.querySelector(".gpa-class-name").textContent,
          { slug: row.dataset.slug || null, label: row.dataset.label || null },
        ])
      );
      const refreshed = currentClassNames().map((name) => {
        const fromDomain = domainSnapshot.find((c) => c.name === name);
        return fromDomain || { name, slug: null, label: null };
      });
      renderGpaClassList(refreshed.map(({ name }) => ({ name, ...(previous.get(name) || { slug: null, label: null }) })));

      document.querySelectorAll(".gpa-class-row").forEach((row, index) => {
        const { slug, label } = refreshed[index];
        row.dataset.slug = slug || "";
        row.dataset.label = label || "";
        setTimeout(() => flipGpaBadge(row, slug, label), index * PASTE_FLIP_STAGGER_MS);
      });
      persistGpaClasses();
      recalculateGpa();
    };

    // The spinner shows for at least MIN_PASTE_LOADING_MS so it doesn't just
    // flicker.
    const finishPaste = (startedAt, domainSnapshot) => {
      const remaining = MIN_PASTE_LOADING_MS - (Date.now() - startedAt);
      setTimeout(
        () => {
          applyDomainSnapshotPaste(domainSnapshot);
          setPasteLoading(false);
          gpaPasteBtn.textContent = "Successfully Pasted!";
          // Re-enabled once a grade changes, since pasting again would do
          // nothing.
          gpaPasteBtn.disabled = true;
        },
        Math.max(0, remaining)
      );
    };

    gpaPasteBtn.addEventListener("click", () => {
      const startedAt = Date.now();
      setPasteLoading(true);

      if (!currentUid || typeof firebase === "undefined" || !firebase.firestore) {
        finishPaste(startedAt, loadDomainSnapshot());
        return;
      }

      firebase
        .firestore()
        .collection("users")
        .doc(currentUid)
        // Must be the latest, so the local cache won't do.
        .get({ source: "server" })
        .then((snapshot) => {
          const cloud = snapshot.exists ? snapshot.data() : {};
          const fetchedLastModified = cloud.lastModified || 0;

          // This read can race a write from another tab; only use it if it
          // isn't older.
          if (fetchedLastModified < (appData.lastModified || 0)) {
            finishPaste(startedAt, appData.domainSnapshot);
            return;
          }

          // A direct fetch gets ciphertext, unlike the boot path, which
          // decrypts.
          return getDeviceKey(currentUid)
            .then((key) => decryptValue(key, cloud.domainSnapshot, []))
            .then((domainSnapshot) => {
              appData.domainSnapshot = domainSnapshot;
              appData.lastModified = fetchedLastModified;
              finishPaste(startedAt, appData.domainSnapshot);
            });
        })
        .catch((error) => {
          console.error("Failed to fetch the latest Domain scores:", error);
          finishPaste(startedAt, loadDomainSnapshot());
        });
    });
  }
}
