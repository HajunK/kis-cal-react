
const EMPTY_SCORE_ROWS = 8;

// An <img> with no src shows the broken-image icon.
const TRANSPARENT_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// The blurred copy (see attachScoreScrollBlur) has inputs too, which would
// otherwise be read and saved twice.
const SCORE_INPUT = ".score-value:not(.score-blur *)";

// The grade math itself (letterGradeForScore, sanitizeScoreInput,
// weightedGrade, scoreNeeded...) is src/core/grades.js; this file reads the
// cards' scores off the page and draws the results.

// Only on blur or Enter, so the icon and FA/SA/D don't change mid-typing.
function updateScoreIcon(input) {
  const icon = input.parentElement.querySelector(".letter-grade");
  if (!icon) return;
  icon.classList.remove("letter-grade--preview");

  if (input.value === "") {
    icon.src = TRANSPARENT_ICON;
    icon.alt = "";
    delete icon.dataset.slug;
    icon.classList.add("letter-grade--empty");
    return;
  }

  const score = parseFloat(input.value);
  if (isNaN(score)) return;

  const tier = letterGradeForScore(score);
  icon.src = gradeIconPath(tier.slug);
  icon.alt = tier.label;
  icon.dataset.slug = tier.slug;
  icon.classList.remove("letter-grade--empty");
}

// Below 50 the leading digits say little about the final score.
function updateScorePreview(input) {
  const icon = input.parentElement.querySelector(".letter-grade");
  if (!icon) return;

  // A numerator alone says nothing about the final score.
  const isFraction = input.value.includes("/");
  const typed = isFraction ? NaN : parseFloat(input.value);
  if (!isNaN(typed) && typed >= 50) {
    const tier = letterGradeForScore(Math.min(typed, 100));
    icon.src = gradeIconPath(tier.slug);
    icon.alt = tier.label;
    icon.dataset.slug = tier.slug;
    icon.classList.remove("letter-grade--empty");
    icon.classList.add("letter-grade--preview");
    return;
  }

  icon.classList.remove("letter-grade--preview");
  const committed = input.dataset.rawValue;
  if (!committed) {
    icon.src = TRANSPARENT_ICON;
    icon.alt = "";
    delete icon.dataset.slug;
    icon.classList.add("letter-grade--empty");
    return;
  }

  const score = parseFloat(committed);
  if (isNaN(score)) return;
  const tier = letterGradeForScore(score);
  icon.src = gradeIconPath(tier.slug);
  icon.alt = tier.label;
  icon.dataset.slug = tier.slug;
  icon.classList.remove("letter-grade--empty");
}

function getBoxScores(box) {
  const scores = [];
  box.querySelectorAll(SCORE_INPUT).forEach((input) => {
    if (input.value === "") return;
    const value = parseFloat(input.value);
    if (!isNaN(value)) scores.push(value);
  });
  return scores;
}

function findAssessmentBox(card, label) {
  return Array.from(card.querySelectorAll(".assessment-box")).find(
    (box) => box.querySelector(".assessment-label").textContent.trim() === label
  );
}

function scoreRowIndex(input) {
  const list = input.closest(".score-list");
  return Array.from(list.querySelectorAll(SCORE_INPUT)).indexOf(input);
}

// Both lists grow together because they scroll together and must stay the same
// length.
function growScoreListsIfLastRowFilled(card, input) {
  if (input.value === "") return;

  const box = input.closest(".assessment-box");
  const label = box.querySelector(".assessment-label").textContent.trim();
  if (label !== "Formatives" && label !== "Summatives") return;

  const rows = box.querySelectorAll(SCORE_INPUT);
  if (rows[rows.length - 1] !== input) return;

  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  if (!formativesBox || !summativesBox) return;

  formativesBox.querySelector(".score-list").appendChild(createScoreRow());
  summativesBox.querySelector(".score-list").appendChild(createScoreRow());
}

// Both trim to whichever needs to stay longer, so they stay the same length.
function shrinkScoreListsIfTrailingRowsEmpty(card, input) {
  if (input.value !== "") return;

  const box = input.closest(".assessment-box");
  const label = box.querySelector(".assessment-label").textContent.trim();
  if (label !== "Formatives" && label !== "Summatives") return;

  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  if (!formativesBox || !summativesBox) return;

  const desiredLength = (assessmentBox) => {
    const rows = Array.from(assessmentBox.querySelectorAll(SCORE_INPUT));
    let lastFilledIndex = -1;
    rows.forEach((row, index) => {
      if (row.value !== "") lastFilledIndex = index;
    });
    return Math.max(EMPTY_SCORE_ROWS, lastFilledIndex + 2);
  };

  const target = Math.max(desiredLength(formativesBox), desiredLength(summativesBox));

  [formativesBox, summativesBox].forEach((assessmentBox) => {
    const list = assessmentBox.querySelector(".score-list");
    while (list.querySelectorAll(SCORE_INPUT).length > target) {
      list.lastElementChild.remove();
    }
  });
}

// Only on the first row, and only while the box is empty; Final Exam's single
// row needs no hint.
function updateEmptyBoxPlaceholder(box) {
  const label = box.querySelector(".assessment-label").textContent.trim();
  if (label !== "Formatives" && label !== "Summatives") return;

  const inputs = box.querySelectorAll(SCORE_INPUT);
  const firstInput = inputs[0];
  if (!firstInput) return;

  const hint = firstInput.parentElement.querySelector(".score-type-hint");
  if (!hint) return;

  const allEmpty = Array.from(inputs).every((input) => input.value === "");
  hint.textContent = allEmpty ? "Type here" : "";
}

// Mirrors recalculateCard, including a higher Summative replacing its
// Formative, so the hint matches what typing that score would really do.
function cardGradeWith(card, targetInput, score) {
  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  const summativeInputs = summativesBox ? [...summativesBox.querySelectorAll(SCORE_INPUT)] : [];
  const raw = (input) => (input ? input.dataset.rawValue ?? input.value : "");
  const replaces = (formativeInput) =>
    formativeInput.dataset.unlinked === undefined
      ? Boolean(window.getPreferences().replaceFormativesByDefault)
      : formativeInput.dataset.unlinked !== "true";

  const boxes = [...card.querySelectorAll(".assessment-box")].map((box) => ({
    weight: parseFloat(box.dataset.baseWeight),
    scores: [...box.querySelectorAll(SCORE_INPUT)].map((input, row) => {
      if (box === formativesBox) {
        const formative = input === targetInput ? String(score) : raw(input);
        const summative = summativeInputs[row] === targetInput ? String(score) : raw(summativeInputs[row]);
        if (formative === "") return null;
        return parseFloat(formativeIsReplaced(formative, summative, replaces(input)) ? summative : formative);
      }
      const value = input === targetInput ? String(score) : input.value;
      return value === "" ? null : parseFloat(value);
    }),
  }));
  return weightedGrade(boxes);
}

function cardUsesDecimals(card) {
  return [...card.querySelectorAll(SCORE_INPUT)].some((scoreInput) =>
    (scoreInput.dataset.rawValue ?? scoreInput.value).includes(".")
  );
}

// Always rounded up (see scoreNeeded), so the number shown is enough.
function scoreNeededForTarget(card, input) {
  return scoreNeeded((score) => cardGradeWith(card, input, score), TARGET_TIERS, cardUsesDecimals(card));
}

// Each empty cell's number is for that cell alone. Because a Summative can
// replace its row's Formative, what it needs depends on its row, so Summatives
// may show two: the last Formative's row and the one below.
function updateTargetHints(card) {
  const boxes = ["Formatives", "Summatives"].map((label) => findAssessmentBox(card, label)).filter(Boolean);
  // Once decimals are in use, every number shows one place for consistency.
  const usesDecimals = cardUsesDecimals(card);
  const show = (input, needed) => {
    const target = input.parentElement.querySelector(".score-target");
    if (!target) return;
    target.innerHTML =
      needed === null
        ? ""
        : `${usesDecimals ? needed.score.toFixed(1) : needed.score} for <span class="score-target-grade" role="img" aria-label="${needed.tier.label}"><span class="score-target-letter" style="--letter: url('${new URL(gradeIconPath(needed.tier.slug), document.baseURI).href}')"></span></span>`;
    // It takes the "Type here" hint's spot, which gives way to it.
    if (needed !== null) {
      const typeHint = input.parentElement.querySelector(".score-type-hint");
      if (typeHint) typeHint.textContent = "";
    }
  };
  boxes.forEach((box) => {
    box.querySelectorAll(SCORE_INPUT).forEach((input) => show(input, null));
    updateEmptyBoxPlaceholder(box);
  });
  const anyScore = [...card.querySelectorAll(SCORE_INPUT)].some((input) => input.value !== "");
  if (!anyScore) return;

  const lastFilledRow = (inputs) => inputs.reduce((last, input, row) => (input.value !== "" ? row : last), -1);
  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  const lastFormativeRow = formativesBox ? lastFilledRow([...formativesBox.querySelectorAll(SCORE_INPUT)]) : -1;
  const summativeInputs = summativesBox ? [...summativesBox.querySelectorAll(SCORE_INPUT)] : [];

  boxes.forEach((box) => {
    const inputs = [...box.querySelectorAll(SCORE_INPUT)];
    const lastFilled = lastFilledRow(inputs);
    let rows = [lastFilled + 1];
    if (box === formativesBox) {
      // A row that already has a Summative may replace whatever goes in beside
      // it, so it's no place to aim.
      let row = lastFilled + 1;
      while (summativeInputs[row] && summativeInputs[row].value !== "") row++;
      rows = [row];
    } else {
      const tied = [lastFormativeRow, lastFormativeRow + 1].filter((row) => row > lastFilled && row >= 0);
      if (tied.length > 0) rows = tied;
    }
    let shown = null;
    rows.forEach((row) => {
      const input = inputs[row];
      if (!input) return;
      const needed = scoreNeededForTarget(card, input);
      // A second identical number would only repeat it.
      const same = (a, b) => (a === null) === (b === null) && (a === null || (a.score === b.score && a.tier === b.tier));
      if (shown !== null && same(needed, shown)) return;
      show(input, needed);
      shown = needed;
    });
    if (shown !== null) {
      box.querySelectorAll(".score-type-hint").forEach((typeHint) => (typeHint.textContent = ""));
    }
  });
}

// The typed Formative stays in data-raw-value, so editing restores it and the
// replacement undoes itself if the Summative drops. recalculate=false lets
// restoreCardScores recalculate once at the end; per-row recalculations would
// roll the breakdown through intermediate values on every load.
function applyFormativeReplacement(card, formativeInput, summativeInput, animate = false, recalculate = true) {
  if (document.activeElement === formativeInput) return;

  const rawFormative = formativeInput.dataset.rawValue ?? formativeInput.value;
  const rawSummative = summativeInput.dataset.rawValue ?? summativeInput.value;
  const fNum = parseFloat(rawFormative);
  const sNum = parseFloat(rawSummative);

  // Qualifies decides whether the link icon shows; applied also needs the row
  // not to be manually unlinked.
  const qualifies = rawFormative !== "" && rawSummative !== "" && !isNaN(fNum) && !isNaN(sNum) && sNum > fNum;

  // A row's first qualification follows the Replace formatives by default
  // setting.
  if (qualifies && formativeInput.dataset.unlinked === undefined && !window.getPreferences().replaceFormativesByDefault) {
    formativeInput.dataset.unlinked = "true";
  }

  const applied = qualifies && formativeInput.dataset.unlinked !== "true";
  const effective = applied ? rawSummative : rawFormative;

  const originalSpan = formativeInput.nextElementSibling;
  const hasOriginalSpan = originalSpan && originalSpan.classList.contains("score-original");
  const needsChange = formativeInput.value !== effective;

  // A swap still playing turns around rather than restarting, even when the
  // value already matches (it was set when that swap began).
  const swapping = Boolean(formativeInput._swap);
  if (animate && hasOriginalSpan && (needsChange || swapping)) {
    // The value changes at once, so averages and saves never see a value that
    // is only there for the animation.
    if (needsChange) {
      formativeInput.value = effective;
      if (!applied) formativeInput.dataset.lastValid = effective;
      updateScoreIcon(formativeInput);
      if (recalculate) recalculateCard(card);
    }
    animateFormativeSwap(formativeInput, originalSpan, applied, rawSummative, rawFormative);
  } else {
    endFormativeSwap(formativeInput);
    if (needsChange) {
      formativeInput.value = effective;
      updateScoreIcon(formativeInput);
      if (recalculate) recalculateCard(card);
    }

    if (hasOriginalSpan) {
      originalSpan.textContent = applied ? rawFormative : "";
    }
  }

  updateFormativeLinkButton(card, formativeInput, summativeInput, qualifies, applied);
}

// Only animated when the Formative itself was deselected.
function syncFormativeReplacementForRow(card, changedInput) {
  const box = changedInput.closest(".assessment-box");
  const label = box.querySelector(".assessment-label").textContent.trim();
  if (label !== "Formatives" && label !== "Summatives") return;

  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  if (!formativesBox || !summativesBox) return;

  const rowIndex = scoreRowIndex(changedInput);
  const formativeInput = formativesBox.querySelectorAll(SCORE_INPUT)[rowIndex];
  const summativeInput = summativesBox.querySelectorAll(SCORE_INPUT)[rowIndex];
  if (!formativeInput || !summativeInput) return;

  // Clearing either side resets the link state, so the row is re-seeded from
  // preferences next time.
  if (changedInput.value === "") {
    delete formativeInput.dataset.unlinked;
  }

  const formativeBefore = formativeInput.value;
  const formativeIcon = formativeInput.parentElement.querySelector(".letter-grade");
  const iconSrcBefore = formativeIcon ? formativeIcon.src : "";
  const originalSpan = formativeInput.nextElementSibling;
  const isLinked = () => Boolean(originalSpan?.classList.contains("score-original") && originalSpan.textContent);
  const wasLinked = isLinked();
  applyFormativeReplacement(card, formativeInput, summativeInput, label === "Formatives");
  if (label === "Summatives" && !wasLinked && isLinked()) showFormativeLinkTipOnce(formativeInput);
  // Under Privacy Blur the changed Formative is briefly revealed; otherwise its
  // number rolls.
  if (label === "Summatives" && formativeInput.value !== formativeBefore) {
    if (document.documentElement.dataset.privacyBlur === "true") {
      revealScoreRowBriefly(formativeInput.closest("li"));
    } else {
      rollScoreInput(formativeInput, formativeBefore, formativeInput.value);
      dissolveScoreIcon(formativeIcon, iconSrcBefore);
    }
  }
}

// Where the input's text sits, measured with its own font, since the box is
// wider than the number in it.
const scoreTextCanvas = document.createElement("canvas").getContext("2d");
function scoreTextCenterX(input, rect) {
  const style = getComputedStyle(input);
  scoreTextCanvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth = scoreTextCanvas.measureText(input.value).width;
  const contentLeft = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const contentWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const align = style.textAlign;
  if (align === "center") return contentLeft + contentWidth / 2;
  if (align === "right" || align === "end") return contentLeft + contentWidth - textWidth / 2;
  return contentLeft + textWidth / 2;
}

const FORMATIVE_LINK_TIP_POINTER_PX = 6;
const FORMATIVE_LINK_TIP_RADIUS_PX = 8;

// One outline for the box and its pointer (at x along the bottom), used both
// to cut the glass and to draw its edge. Only rebuilt when it changes.
function shapeFormativeLinkTip(tip, x) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const key = `${w},${h},${x}`;
  if (tip._shapeKey === key) return;
  tip._shapeKey = key;

  const r = FORMATIVE_LINK_TIP_RADIUS_PX;
  const p = FORMATIVE_LINK_TIP_POINTER_PX;
  const box = h - p;
  // Kept clear of the rounded corners.
  const ax = Math.max(r + p, Math.min(x, w - r - p));
  const path =
    `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${box - r} A${r},${r} 0 0 1 ${w - r},${box} ` +
    // The pointer, its tip softly rounded.
    `H${ax + p} L${ax + 1.2},${h - 0.8} Q${ax},${h + 0.2} ${ax - 1.2},${h - 0.8} L${ax - p},${box} ` +
    `H${r} A${r},${r} 0 0 1 0,${box - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
  tip.style.clipPath = `path("${path}")`;
  const svg = tip.querySelector(".formative-link-tip-edge");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.querySelectorAll("path").forEach((edge) => edge.setAttribute("d", path));
}

// The first time a typed Summative takes over a Formative, a short tour walks
// through the link: the Formative's new score, then the original kept beside
// it. Each step waits for OK. Shown until both have been OK'd, once per
// account.
let formativeLinkTip = null;

function showFormativeLinkTipOnce(formativeInput) {
  if (window.getPreferences().seenFormativeLinkTip || formativeLinkTip) return;

  const row = formativeInput.closest("li");
  const steps = [
    { text: "Linked to new score", target: () => formativeInput, centerX: (rect) => scoreTextCenterX(formativeInput, rect) },
    {
      text: "Original score",
      // A date in the row would otherwise hide it.
      enter: () => row.classList.add("force-original"),
      leave: () => row.classList.remove("force-original"),
      target: () => formativeInput.nextElementSibling,
    },
  ];
  let index = -1;
  let tip = null;
  let showTimer = null;
  let frame = null;

  function fadeOut(old) {
    old.classList.remove("formative-link-tip--visible");
    setTimeout(() => old.remove(), 200);
  }

  // Follows its target every frame, so it moves with any scroll, resize or
  // reflow, and hides while the target is scrolled out of view.
  function place() {
    const step = steps[index];
    if (!tip || !step) return;
    step.enter?.();  // again, in case the row was rebuilt
    const target = step.target();
    // Its row is gone for good (the Summative was lowered or the card was
    // rebuilt), so there's nothing left to point at.
    if (!target || !target.isConnected) return end();

    const rect = target.getBoundingClientRect();
    const list = formativeInput.closest(".score-list");
    const listRect = list ? list.getBoundingClientRect() : null;
    const rowMid = (rect.top + rect.bottom) / 2;
    const inView =
      rect.width > 0 && (!listRect || (rowMid > listRect.top && rowMid < listRect.bottom));
    tip.style.visibility = inView ? "" : "hidden";
    if (!inView) return;

    const pointerGap = 10;
    const centerX = step.centerX ? step.centerX(rect) : rect.left + rect.width / 2;
    const left = Math.max(
      HOVER_TOOLTIP_EDGE_GAP,
      Math.min(Math.round(centerX - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - HOVER_TOOLTIP_EDGE_GAP)
    );
    // The element's bottom is the pointer's tip.
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.round(rect.top - tip.offsetHeight - pointerGap + FORMATIVE_LINK_TIP_POINTER_PX)}px`;
    shapeFormativeLinkTip(tip, Math.round(centerX - left));
  }

  function follow() {
    place();
    if (tip) frame = requestAnimationFrame(follow);
  }

  function showStep(next) {
    if (index >= 0) steps[index].leave?.();
    if (tip) fadeOut(tip);
    tip = null;
    index = next;
    const step = steps[index];
    if (!step) {
      // Past the last OK, so it's been seen through. Left unsaved otherwise,
      // so a tour cut short (its row removed) comes back next time.
      window.setPreference("seenFormativeLinkTip", true);
      return end();
    }
    // The tour's tip says it all; a hover tooltip would only cover it.
    document.documentElement.dataset.suppressTooltips = "true";
    hideHoverTooltip();
    step.enter?.();
    if (!step.target()?.isConnected) return end();

    tip = document.createElement("div");
    tip.className = "hover-tooltip formative-link-tip";
    tip.setAttribute("role", "status");
    tip.appendChild(document.createElement("span")).textContent = step.text;
    const ok = tip.appendChild(document.createElement("button"));
    ok.type = "button";
    ok.className = "formative-link-tip-ok";
    ok.textContent = "OK";
    // Keeps focus in the Summative being typed, so the click doesn't blur it.
    ok.addEventListener("mousedown", (event) => event.preventDefault());
    ok.addEventListener("click", () => showStep(index + 1));
    tip.insertAdjacentHTML(
      "beforeend",
      `<svg class="formative-link-tip-edge" aria-hidden="true"><defs><linearGradient id="formative-link-tip-rim" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" style="stop-color:var(--glass-rim-bright)"/><stop offset="0.3" style="stop-color:var(--glass-rim-dim)"/>` +
        `<stop offset="0.7" style="stop-color:var(--glass-rim-dim)"/><stop offset="1" style="stop-color:var(--glass-rim-bright)"/>` +
        `</linearGradient></defs><path class="rim" stroke="url(#formative-link-tip-rim)"/><path class="outline"/></svg>`
    );
    document.body.appendChild(tip);

    cancelAnimationFrame(frame);
    follow();
    // The first step waits for the Formative's number roll, so the eye lands
    // on both together.
    const shown = tip;
    showTimer = setTimeout(() => shown.classList.add("formative-link-tip--visible"), index === 0 ? 250 : 0);
  }

  // Only OK moves it on or closes it.
  function end() {
    clearTimeout(showTimer);
    cancelAnimationFrame(frame);
    if (index >= 0 && steps[index]) steps[index].leave?.();
    if (tip) fadeOut(tip);
    tip = null;
    index = steps.length;
    formativeLinkTip = null;
    delete document.documentElement.dataset.suppressTooltips;
  }
  formativeLinkTip = { end };
  showStep(0);
}

// A copy of the old icon fades out over the updated one, like the big badge's
// tier change.
function dissolveScoreIcon(icon, oldSrc) {
  const row = icon && icon.closest("li");
  if (!row || !oldSrc || icon.src === oldSrc) return;

  const iconRect = icon.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const ghost = icon.cloneNode();
  ghost.removeAttribute("id");
  ghost.src = oldSrc;
  ghost.style.cssText =
    `position:absolute; pointer-events:none; margin:0; left:${iconRect.left - rowRect.left}px; ` +
    `top:${iconRect.top - rowRect.top}px; width:${iconRect.width}px; height:${iconRect.height}px; ` +
    `opacity:1; transition:opacity ${DOMAIN_BADGE_FADE_MS}ms ease;`;
  row.appendChild(ghost);
  void ghost.offsetWidth;  // so the fade transitions
  ghost.style.opacity = "0";
  setTimeout(() => ghost.remove(), DOMAIN_BADGE_FADE_MS + 60);
}

// An <input> can't hold the roll, so a matching span is laid over it while the
// input's text is hidden.
function rollScoreInput(input, oldText, newText) {
  const row = input.closest("li");
  if (!row) return;

  if (input._rollOverlay) input._rollOverlay.remove();
  clearTimeout(input._rollOverlayTimer);

  const inputRect = input.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const style = getComputedStyle(input);
  const slotHeight = Math.ceil(parseFloat(style.fontSize) * 1.2); // same as animateNumberChange's own

  const overlay = document.createElement("span");
  overlay.textContent = oldText;
  overlay.style.cssText = `position:absolute; pointer-events:none; white-space:nowrap; font:${style.font}; color:${style.color};` +
    `left:${inputRect.left - rowRect.left}px; top:${inputRect.top - rowRect.top + (inputRect.height - slotHeight) / 2}px;`;
  row.appendChild(overlay);
  input._rollOverlay = overlay;

  const originalColor = input.style.color;
  input.style.color = "transparent";
  animateNumberChange(overlay, newText);

  input._rollOverlayTimer = setTimeout(() => {
    overlay.remove();
    input._rollOverlay = null;
    input.style.color = originalColor;
  }, ROLL_DURATION_MS + ROLL_STAGGER_MS * newText.length + 100);
}

const scoreRevealTimers = new WeakMap();
const SCORE_ROW_REVEAL_MS = 500;

function revealScoreRowBriefly(row) {
  if (!row) return;
  clearTimeout(scoreRevealTimers.get(row));
  row.dataset.revealScore = "true";
  scoreRevealTimers.set(
    row,
    setTimeout(() => {
      delete row.dataset.revealScore;
      scoreRevealTimers.delete(row);
    }, SCORE_ROW_REVEAL_MS)
  );
}

// Appended to .assessment-groups rather than the scrolling list, so the list's
// overflow doesn't clip it.
function updateFormativeLinkButton(card, formativeInput, summativeInput, qualifies, applied) {
  let btn = formativeInput._linkBtn;

  if (!qualifies) {
    if (btn) btn.remove();
    formativeInput._linkBtn = null;
    return;
  }

  const groups = card.querySelector(".assessment-groups");

  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "formative-link-btn";

    const icon = document.createElement("img");
    icon.className = "formative-link-icon";
    icon.alt = "";
    btn.appendChild(icon);

    // Prevents blurring the focused field, so a click never races the blur-
    // triggered recalculation.
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    // Says what a click would do.
    attachHoverTooltip(btn, () => btn._tooltip);
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      formativeInput.dataset.unlinked = formativeInput.dataset.unlinked === "true" ? "" : "true";
      applyFormativeReplacement(card, formativeInput, summativeInput, true);

      // The roll can reflow the card while it plays, so the button follows the
      // row for that whole time instead of snapping.
      const trackUntil = performance.now() + ROLL_DURATION_MS + 100;
      const track = () => {
        const liveBtn = formativeInput._linkBtn;
        if (liveBtn) positionFormativeLinkButton(groups, formativeInput, liveBtn);
        if (performance.now() < trackUntil) requestAnimationFrame(track);
      };
      requestAnimationFrame(track);
    });

    // The button sits outside its row, so CSS :hover on the row can't react to
    // it.
    btn.addEventListener("mouseenter", () => {
      formativeInput.closest("li").classList.add("force-original");
    });
    btn.addEventListener("mouseleave", () => {
      formativeInput.closest("li").classList.remove("force-original");
    });

    groups.appendChild(btn);
    formativeInput._linkBtn = btn;
    btn._formativeInput = formativeInput;
  }

  btn.querySelector(".formative-link-icon").src = applied ? uiIconPath("unlink.png") : uiIconPath("link.png");
  btn._tooltip = applied ? "Unlink" : "Link";
  positionFormativeLinkButton(groups, formativeInput, btn);
}

// Must match the fade heights in domain-scores.css (.assessment-
// box::before/::after).
const LINK_BTN_TOP_FADE_PX = 14;
const LINK_BTN_BOTTOM_FADE_PX = 36;
// Matches .formative-link-btn's mask-size/position and covers its shadow.
const LINK_BTN_MASK_BLEED_PX = 12;

function positionFormativeLinkButton(groups, formativeInput, btn) {
  const list = formativeInput.closest(".score-list");
  const row = formativeInput.closest("li");
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const groupsRect = groups.getBoundingClientRect();

  const box = list.closest(".assessment-box");
  const hasFades = !box.classList.contains("assessment-box--wide");
  const clearTop = listRect.top + parseFloat(getComputedStyle(list).paddingTop);
  const fadeTop = hasFades ? clearTop - LINK_BTN_TOP_FADE_PX : listRect.top;
  const visible = rowRect.bottom > fadeTop && rowRect.top < listRect.bottom;
  btn.style.display = visible ? "flex" : "none";
  if (!visible) return;

  const centerY = rowRect.top + rowRect.height / 2;
  btn.style.top = `${centerY - groupsRect.top}px`;

  // The rows fade under surface-colored overlays, but the button sits over the
  // box borders, which an overlay would hide too, so it gets a mask in its own
  // pixels instead.
  const maskTop = centerY - btn.offsetHeight / 2 - LINK_BTN_MASK_BLEED_PX;
  const stops = [];
  if (hasFades) {
    stops.push(`transparent ${fadeTop - maskTop}px`, `#000 ${clearTop - maskTop}px`);
  } else {
    stops.push("#000 0px");
  }
  if (hasFades) {
    stops.push(`#000 ${listRect.bottom - LINK_BTN_BOTTOM_FADE_PX - maskTop}px`, `transparent ${listRect.bottom - maskTop}px`);
  }
  btn.style.setProperty("--edge-mask", `linear-gradient(to bottom, ${stops.join(", ")})`);

  // Too faint to aim at, so it stops taking clicks.
  const topFade = hasFades ? (centerY - fadeTop) / LINK_BTN_TOP_FADE_PX : 1;
  const bottomFade = hasFades ? (listRect.bottom - centerY) / LINK_BTN_BOTTOM_FADE_PX : 1;
  btn.style.pointerEvents = Math.min(topFade, bottomFade) < 0.5 ? "none" : "";
}

function repositionFormativeLinkButtons(card) {
  const groups = card.querySelector(".assessment-groups");
  groups.querySelectorAll(".formative-link-btn").forEach((btn) => {
    positionFormativeLinkButton(groups, btn._formativeInput, btn);
  });
}

// null excludes the box from the domain calculation.
function parsePercent(text) {
  const match = /\d+(\.\d+)?/.exec(text);
  return match ? parseFloat(match[0]) : null;
}

// Restoring saved scores on page load shouldn't animate.
function firstRevealStyle(card) {
  return card.dataset.settled === "true" ? "blur" : "instant";
}

function setBreakdownValue(card, index, value, revealStyle = firstRevealStyle(card)) {
  const span = card.querySelectorAll(".breakdown-values .breakdown-value")[index];
  if (!span) return;
  animateNumberChange(span, value === null ? "-" : truncateToTwoDecimals(value), revealStyle);
}

function setBreakdownSingle(card, label, value, revealStyle = firstRevealStyle(card)) {
  const single = card.querySelector(".breakdown-single");
  if (!single) return;
  single.querySelector(".breakdown-single-label").textContent = label;
  animateNumberChange(single.querySelector(".breakdown-value"), truncateToTwoDecimals(value), revealStyle);
}

function setBreakdownState(card, state) {
  const breakdown = card.querySelector(".grade-breakdown");
  if (!breakdown || breakdown.dataset.state === state) return false;
  const instant = card.dataset.settled !== "true";
  if (instant) breakdown.classList.add("grade-breakdown--instant");
  breakdown.dataset.state = state;
  if (instant) {
    void breakdown.offsetWidth;  // so the swap applies with transitions off
    breakdown.classList.remove("grade-breakdown--instant");
  }
  return true;
}

// Cleared on every new crossfade so an older one's delayed cleanup can't put a
// stale tier back.
const badgeFadeTimeouts = new WeakMap();

const DOMAIN_BADGE_FADE_MS = 200;

// An <img> src swap has nothing to interpolate, so the new icon fades in on a
// layer above and the base catches up afterwards.
function crossfadeBadgeIcon(wrap, badge, tier) {
  const fadeLayer = wrap.querySelector(".letter-grade-lg-fade");
  if (!fadeLayer) {
    badge.src = gradeIconPath(tier.slug);
    badge.alt = tier.label;
    badge.dataset.slug = tier.slug;
    return;
  }

  clearTimeout(badgeFadeTimeouts.get(fadeLayer));

  // Set while invisible so the new icon never flashes in early.
  fadeLayer.src = gradeIconPath(tier.slug);
  fadeLayer.dataset.slug = tier.slug; // its CSS circle color follows this
  fadeLayer.alt = tier.label;
  fadeLayer.style.opacity = "1";

  badgeFadeTimeouts.set(
    fadeLayer,
    setTimeout(() => {
      badge.src = gradeIconPath(tier.slug);
      badge.alt = tier.label;
      badge.dataset.slug = tier.slug;
      fadeLayer.style.opacity = "";
      badgeFadeTimeouts.delete(fadeLayer);
    }, DOMAIN_BADGE_FADE_MS)
  );
}

function updateDomainBadge(card, domain) {
  const summary = card.querySelector(".grade-summary");
  const gradeValueEl = summary.querySelector(".grade-value");
  let wrap = summary.querySelector(".letter-grade-lg-wrap");
  let badge = wrap ? wrap.querySelector(".letter-grade--lg:not(.letter-grade-lg-fade)") : null;

  if (domain === null) {
    if (wrap) wrap.remove();
    // Through animateNumberChange so its roll memory becomes "--"; otherwise
    // the next score would roll from the last valid one instead of appearing
    // fresh. Marked as a placeholder so Privacy Blur leaves it alone.
    gradeValueEl.dataset.empty = "true";
    animateNumberChange(gradeValueEl, "--", firstRevealStyle(card));
    return;
  }

  const rounded = Math.round(domain);
  const tier = letterGradeForScore(rounded);

  if (!wrap) {
    wrap = document.createElement("span");
    wrap.className = "letter-grade-lg-wrap";

    badge = document.createElement("img");
    badge.className = "letter-grade letter-grade--lg";

    const fadeLayer = document.createElement("img");
    fadeLayer.className = "letter-grade letter-grade--lg letter-grade-lg-fade";
    fadeLayer.alt = "";
    fadeLayer.setAttribute("aria-hidden", "true");

    wrap.append(badge, fadeLayer);
    summary.insertBefore(wrap, gradeValueEl);

    // First appearance, so no fade.
    badge.src = gradeIconPath(tier.slug);
    badge.alt = tier.label;
    badge.dataset.slug = tier.slug;
  } else if (badge.dataset.slug !== tier.slug) {
    crossfadeBadgeIcon(wrap, badge, tier);
  }

  delete gradeValueEl.dataset.empty;
  animateNumberChange(gradeValueEl, String(rounded), firstRevealStyle(card));
}

// Boxes with no scores are left out of the weighted average.
function recalculateCard(card) {
  let faAverage = null;
  let saAverage = null;
  let scoredBoxes = 0;

  const boxes = [...card.querySelectorAll(".assessment-box")].map((box) => {
    const label = box.querySelector(".assessment-label").textContent.trim();
    const scores = getBoxScores(box);
    const avg = average(scores);
    if (label === "Formatives") faAverage = avg;
    if (label === "Summatives") saAverage = avg;
    if (avg !== null) scoredBoxes++;
    return { weight: parseFloat(box.dataset.baseWeight), scores };
  });

  const domain = weightedGrade(boxes);

  // With nothing scored, the numbers stay hidden behind "No grades yet";
  // rolling them to "-" would only flash. With one box scored, D would just
  // repeat its average, so only that is shown.
  const onlyAverage = scoredBoxes === 1 ? (faAverage ?? saAverage) : null;
  if (domain === null) {
    setBreakdownState(card, "empty");
  } else if (onlyAverage !== null) {
    // A layer swapping in already fades from blur as a whole, so its number
    // shouldn't blur in again.
    const style = setBreakdownState(card, "single") ? "instant" : undefined;
    setBreakdownSingle(card, faAverage !== null ? "Formative Average" : "Summative Average", onlyAverage, style);
  } else {
    const style = setBreakdownState(card, "values") ? "instant" : undefined;
    setBreakdownValue(card, 0, faAverage, style);
    setBreakdownValue(card, 1, saAverage, style);
    setBreakdownValue(card, 2, domain, style);
  }
  updateDomainBadge(card, domain);
  updateTargetHints(card);
  saveDomainSnapshot();
  persistCardScores(card);
}

// For the GPA tab's "Paste from Domain Tab".
function saveDomainSnapshot() {
  const container = document.querySelector('.classes-container[data-dynamic="true"]');
  if (!container) return;

  // The pinned copy (see syncPinnedCurrentCard) would list it twice.
  const snapshot = Array.from(container.querySelectorAll(".class-card:not([data-pinned])")).map((card) => {
    const badge = card.querySelector(".letter-grade--lg:not(.letter-grade-lg-fade)");
    return {
      name: card.querySelector(".class-name").textContent,
      slug: badge ? badge.dataset.slug || null : null,
      label: badge ? badge.alt : null,
    };
  });
  appData.domainSnapshot = snapshot;
  pushDataToCloud();
}

function loadDomainScores() {
  return appData.domainScores;
}

function saveDomainScores(scores) {
  appData.domainScores = scores;
  pushDataToCloud();
}

function serializeCardScores(card) {
  const name = card.querySelector(".class-name").textContent;
  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  const finalBox = findAssessmentBox(card, "Final Exam");

  // Numbers, not the strings the DOM hands back.
  const values = (box) =>
    box
      ? Array.from(box.querySelectorAll(SCORE_INPUT)).map((input) => {
          const raw = input.dataset.rawValue ?? input.value;
          return raw === "" ? null : Number(raw);
        })
      : [];

  const formativeInputs = formativesBox ? Array.from(formativesBox.querySelectorAll(SCORE_INPUT)) : [];
  const summativeInputs = summativesBox ? Array.from(summativesBox.querySelectorAll(SCORE_INPUT)) : [];

  const datesFor = (inputs) =>
    inputs.map((input) => {
      const label = input.parentElement.querySelector(".score-date-label");
      return (label && label.dataset.isoDate) || "";
    });

  const unlinkedRows = [];
  formativeInputs.forEach((input, index) => {
    if (input.dataset.unlinked === "true") unlinkedRows.push(index);
  });

  return {
    name,
    formative: values(formativesBox),
    summative: values(summativesBox),
    final: values(finalBox),
    formativeDates: datesFor(formativeInputs),
    summativeDates: datesFor(summativeInputs),
    unlinkedRows,
  };
}

function persistCardScores(card) {
  const data = serializeCardScores(card);
  const all = loadDomainScores();
  all[data.name] = data;
  saveDomainScores(all);
  syncTwinCard(card);
}

function restoreCardScores(card, name) {
  const saved = loadDomainScores()[name];
  if (!saved) return;

  const formativesBox = findAssessmentBox(card, "Formatives");
  const summativesBox = findAssessmentBox(card, "Summatives");
  const finalBox = findAssessmentBox(card, "Final Exam");

  if (formativesBox && summativesBox) {
    const list1 = formativesBox.querySelector(".score-list");
    const list2 = summativesBox.querySelector(".score-list");
    // Rebuilt from the last filled score rather than the saved length: old
    // saves can end in long runs of empty entries (from when the blurred copy's
    // rows were counted), which would come back as rows every load.
    const lastFilled = (values) => {
      let last = -1;
      (values || []).forEach((value, index) => {
        if (value !== null && value !== undefined && value !== "") last = index;
      });
      return last;
    };
    const needed = Math.max(
      EMPTY_SCORE_ROWS,
      Math.max(lastFilled(saved.formative), lastFilled(saved.summative)) + 2
    );
    while (list1.querySelectorAll(SCORE_INPUT).length < needed) list1.appendChild(createScoreRow());
    while (list2.querySelectorAll(SCORE_INPUT).length < needed) list2.appendChild(createScoreRow());
  }

  const restoreBoxRows = (box, savedValues) => {
    if (!box || !savedValues) return;
    const inputs = box.querySelectorAll(SCORE_INPUT);
    savedValues.forEach((value, index) => {
      const input = inputs[index];
      // Not a falsy check: a real score of 0 is falsy.
      if (!input || value === null || value === undefined) return;
      const text = String(value);
      input.value = text;
      input.dataset.rawValue = text;
      input.dataset.lastValid = text;
      updateScoreIcon(input);
    });
  };

  restoreBoxRows(formativesBox, saved.formative);
  restoreBoxRows(summativesBox, saved.summative);
  restoreBoxRows(finalBox, saved.final);

  if (formativesBox && summativesBox) {
    const formativeInputs = formativesBox.querySelectorAll(SCORE_INPUT);
    const summativeInputs = summativesBox.querySelectorAll(SCORE_INPUT);

    const restoreDates = (inputs, savedDates) => {
      (savedDates || []).forEach((isoDate, index) => {
        const input = inputs[index];
        const label = input && input.parentElement.querySelector(".score-date-label");
        if (label && isoDate) {
          label.dataset.isoDate = isoDate;
          label.textContent = formatAssessmentDate(fromISODate(isoDate));
        }
      });
    };

    restoreDates(formativeInputs, saved.formativeDates);
    restoreDates(summativeInputs, saved.summativeDates);

    // Only rows where a Summative already beats its Formative have a decided
    // link. Others stay undefined so the Replace formatives by default setting
    // still applies when they first qualify.
    const unlinkedSet = new Set(saved.unlinkedRows || []);
    formativeInputs.forEach((input, index) => {
      const formative = parseFloat(input.dataset.rawValue ?? input.value);
      const summative = summativeInputs[index] ? parseFloat(summativeInputs[index].value) : NaN;
      if (!isNaN(formative) && !isNaN(summative) && summative > formative) {
        input.dataset.unlinked = unlinkedSet.has(index) ? "true" : "false";
      } else {
        delete input.dataset.unlinked;
      }
    });

    formativeInputs.forEach((formativeInput, index) => {
      if (summativeInputs[index]) applyFormativeReplacement(card, formativeInput, summativeInputs[index], false, false);
    });
  }

  [formativesBox, summativesBox].forEach((box) => {
    if (box) updateEmptyBoxPlaceholder(box);
  });

  recalculateCard(card);
}

// Grades and the committed icon wait until the field is left; only the preview
// updates while typing.
document.addEventListener("input", (event) => {
  const input = event.target;
  if (!input.classList.contains("score-value")) return;

  const sanitized = sanitizeScoreInput(input.value);
  // A fraction's range can't be judged until it's complete, so it's checked on
  // commit.
  const isFraction = sanitized.includes("/");
  const numeric = parseFloat(sanitized);
  const isOverMax = !isFraction && sanitized !== "" && sanitized !== "." && !isNaN(numeric) && numeric > 100;
  // "0", "0.5" and "0/..." are fine; only "05"-style input isn't.
  const hasInvalidLeadingZero =
    !isFraction && sanitized.length > 1 && sanitized[0] === "0" && sanitized[1] !== ".";

  if (isOverMax || hasInvalidLeadingZero) {
    // Rejected outright rather than corrected after the fact.
    input.value = input.dataset.lastValid !== undefined ? input.dataset.lastValid : input.defaultValue;
  } else {
    input.value = sanitized;
    input.dataset.lastValid = sanitized;
  }

  updateScorePreview(input);
  updateFractionOverlay(input);
});

// An <input> colors all its text at once, so while a "/" is typed, a copy of
// the text is laid over it with the slash grayed.
function updateFractionOverlay(input) {
  const row = input.closest("li");
  const showing = Boolean(input._fractionOverlay);
  const wanted = row && input.value.includes("/") && document.activeElement === input;
  if (!wanted) {
    if (showing) {
      input._fractionOverlay.remove();
      input._fractionOverlay = null;
      input.style.color = "";
      input.style.caretColor = "";
    }
    return;
  }

  const style = getComputedStyle(input);
  let overlay = input._fractionOverlay;
  if (!overlay) {
    overlay = document.createElement("span");
    overlay.className = "score-fraction-overlay";
    row.appendChild(overlay);
    input._fractionOverlay = overlay;
    input.style.caretColor = style.color;
    input.style.color = "transparent";
    input.addEventListener("scroll", () => updateFractionOverlay(input));
  }
  const inputRect = input.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  overlay.style.cssText =
    `position:absolute; pointer-events:none; white-space:pre; display:flex; align-items:center; overflow:hidden; ` +
    `font:${style.font}; letter-spacing:${style.letterSpacing}; color:${input.style.caretColor}; ` +
    `left:${inputRect.left - rowRect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)}px; ` +
    `top:${inputRect.top - rowRect.top}px; height:${inputRect.height}px; ` +
    `width:${input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px;`;
  const text = document.createElement("span");
  text.style.transform = `translateX(${-input.scrollLeft}px)`;
  input.value.split("/").forEach((part, i) => {
    if (i > 0) {
      const slash = document.createElement("span");
      slash.className = "score-fraction-slash";
      slash.textContent = "/";
      text.appendChild(slash);
    }
    text.appendChild(document.createTextNode(part));
  });
  overlay.replaceChildren(text);
}

// Leaving the field (or Enter) is the only thing that commits a score.
document.addEventListener(
  "blur",
  (event) => {
    if (!event.target.classList.contains("score-value")) return;
    event.target.value = commitFractionInput(event.target.value);
    updateFractionOverlay(event.target);
    if (event.target.value.endsWith(".")) {
      event.target.value = event.target.value.slice(0, -1);
    }
    event.target.dataset.rawValue = event.target.value;

    if (event.target.value === "") {
      const dateLabel = event.target.parentElement.querySelector(".score-date-label");
      if (dateLabel) {
        dateLabel.textContent = "";
        delete dateLabel.dataset.isoDate;
      }
    }

    const card = event.target.closest(".class-card");
    if (card) syncFormativeReplacementForRow(card, event.target);

    updateScoreIcon(event.target);
    // Before recalculateCard, which saves the card: shrinking after would save
    // the old row count.
    if (card) shrinkScoreListsIfTrailingRowsEmpty(card, event.target);
    if (card) recalculateCard(card);
    if (card) growScoreListsIfLastRowFilled(card, event.target);

    const box = event.target.closest(".assessment-box");
    if (box) updateEmptyBoxPlaceholder(box);
    // Again once the new empty row exists, since that's where the next hint
    // goes.
    if (card) updateTargetHints(card);
  },
  true
);

const FORMATIVE_REVEAL_MS = 280;
const FORMATIVE_DATE_ICON_FADE_MS = 120;

// Moves between a linked Formative (the Summative's score in the input, its
// own score small beside it) and an unlinked one (its own score in the input).
// The small number grows into the input's place while the Summative's slides
// off, FLIP-style, since they're separate elements.
//
// The input already holds its real value throughout and its text is hidden;
// the outgoing number is a stand-in span. Both moves are Web Animations, so a
// swap called again mid-way (spam clicking the link button) reverses them from
// where they are instead of jumping. onDone runs once it settles unlinked.
function animateFormativeSwap(input, originalSpan, toLinked, linkedText, rawText, onDone) {
  const swap = input._swap;
  if (swap) {
    if (swap.toLinked !== toLinked) {
      swap.toLinked = toLinked;
      swap.onDone = onDone;
      swap.ghostAnim.reverse();
      swap.spanAnim.reverse();
    }
    return;
  }

  const row = originalSpan.closest("li");
  if (!row) return;
  // A number roll still playing hides the input's text too, so the stand-in
  // would copy that transparent color.
  if (input._rollOverlay) {
    clearTimeout(input._rollOverlayTimer);
    input._rollOverlay.remove();
    input._rollOverlay = null;
    input.style.color = "";
  }
  // Keeps the original score visible for the whole swap, whatever the hover
  // state or a date in the row.
  row.classList.add("swap-animating");
  originalSpan.textContent = rawText;

  const style = getComputedStyle(input);
  const inputRect = input.getBoundingClientRect();
  const spanRect = originalSpan.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const spanStyle = getComputedStyle(originalSpan);

  // Left edges, with transform-origin: left, so the small number lands where
  // the big digits start.
  const dx = inputRect.left - spanRect.left;
  const dy = inputRect.top + inputRect.height / 2 - (spanRect.top + spanRect.height / 2);
  const scale = parseFloat(style.fontSize) / parseFloat(spanStyle.fontSize);

  // Laid over the input like rollScoreInput's overlay.
  const lineHeight = Math.ceil(parseFloat(style.fontSize) * 1.2);
  const ghost = document.createElement("span");
  ghost.textContent = linkedText;
  ghost.style.cssText =
    `position:absolute; pointer-events:none; white-space:nowrap; font:${style.font}; color:${style.color}; ` +
    `filter:${style.filter}; line-height:${lineHeight}px; ` +
    `left:${inputRect.left - rowRect.left + parseFloat(style.paddingLeft)}px; ` +
    `top:${inputRect.top - rowRect.top + (inputRect.height - lineHeight) / 2}px;`;
  row.appendChild(ghost);

  // Keyframes in the direction this swap starts, so it plays forwards with
  // ease's quick start either way; played backwards, linking began slowly.
  // Only a turnaround mid-way plays them backwards.
  const timing = { duration: FORMATIVE_REVEAL_MS, easing: "ease", fill: "both" };
  const inStartDirection = (frames) => (toLinked ? frames.reverse() : frames);
  const ghostAnim = ghost.animate(
    inStartDirection([
      { transform: "translateX(0)", opacity: 1 },
      { transform: "translateX(-24px)", opacity: 0 },
    ]),
    timing
  );
  const spanAnim = originalSpan.animate(
    inStartDirection([
      { transform: "translateY(-50%)", color: spanStyle.color },
      { transform: `translateY(-50%) translate(${dx}px, ${dy}px) scale(${scale})`, color: style.color },
    ]),
    timing
  );

  input.style.color = "transparent";

  // The date button sits where the small number grows.
  const dateBtn = input.parentElement.querySelector(".score-date-btn");
  if (dateBtn) {
    dateBtn.style.transition = `opacity ${FORMATIVE_DATE_ICON_FADE_MS}ms ease`;
    dateBtn.style.opacity = "0";
  }

  input._swap = { toLinked, onDone, ghost, ghostAnim, spanAnim, row, dateBtn, originalSpan };
  // finish fires again after each reversal; only a settled swap ends.
  ghostAnim.addEventListener("finish", () => {
    const current = input._swap;
    if (!current || current.ghostAnim !== ghostAnim || ghostAnim.playState !== "finished") return;
    endFormativeSwap(input);
    if (!current.toLinked) {
      originalSpan.textContent = "";
      if (current.onDone) current.onDone();
    }
  });
}

// Drops a swap in place, for when the row is about to be set without one.
function endFormativeSwap(input) {
  const swap = input._swap;
  if (!swap) return;
  input._swap = null;
  swap.ghostAnim.cancel();
  swap.spanAnim.cancel();
  swap.ghost.remove();
  input.style.color = "";
  swap.row.classList.remove("swap-animating");
  if (swap.dateBtn) {
    swap.dateBtn.style.transition = "";
    swap.dateBtn.style.opacity = "";
  }
}

// Label clicks on the icon focus the input too; mousedown, which always comes
// first, records which was clicked.
let scoreFocusViaIcon = null;

document.addEventListener(
  "mousedown",
  (event) => {
    if (!event.target.classList.contains("letter-grade")) return;
    const label = event.target.closest(".score-list li label");
    scoreFocusViaIcon = label ? label.querySelector(SCORE_INPUT) : null;
  },
  true
);

// Editing starts from what was typed, not the replaced display value. Clicking
// the icon selects the whole value.
document.addEventListener(
  "focus",
  (event) => {
    if (!event.target.classList.contains("score-value")) return;

    const input = event.target;
    const viaIcon = scoreFocusViaIcon === input;
    scoreFocusViaIcon = null;

    const placeCaret = () => {
      if (viaIcon) {
        input.select();
      } else {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    };

    const raw = input.dataset.rawValue;
    if (raw === undefined || input.value === raw) {
      if (viaIcon) input.select();
      return;
    }

    const originalSpan = input.nextElementSibling;
    const hasOriginalSpan = originalSpan && originalSpan.classList.contains("score-original");

    const shownText = input.value;
    input.value = raw;
    input.dataset.lastValid = raw;
    placeCaret();
    if (hasOriginalSpan) {
      animateFormativeSwap(input, originalSpan, false, shownText, raw);
    }
  },
  true
);

// After Enter under Privacy Blur, the big grade stays visible until its roll
// has finished, so the change can be seen.
const domainRevealTimers = new WeakMap();
const DOMAIN_REVEAL_LINGER_MS = 200;

function revealDomainScoreBriefly(card) {
  const gradeValue = card.querySelector(".grade-value");
  const rolling = gradeValue;
  const digits = gradeValue ? (gradeValue.dataset.rollValue || gradeValue.textContent).length : 0;
  // Matches animateNumberChange's own cleanup timer.
  const rollMs = rolling ? ROLL_DURATION_MS + ROLL_STAGGER_MS * digits + 50 : 0;

  clearTimeout(domainRevealTimers.get(card));
  card.dataset.revealDomain = "true";
  domainRevealTimers.set(
    card,
    setTimeout(() => {
      delete card.dataset.revealDomain;
      domainRevealTimers.delete(card);
    }, rollMs + DOMAIN_REVEAL_LINGER_MS)
  );
}

// Native Tab would land on this row's date button instead of the next score.
function moveToNextScoreCell(input) {
  const list = input.closest(".score-list");
  const inputs = Array.from(list.querySelectorAll(SCORE_INPUT));
  const next = inputs[inputs.indexOf(input) + 1];
  if (!next) return false;
  next.focus();
  next.select();
  return true;
}

document.addEventListener("keydown", (event) => {
  if (!event.target.classList.contains("score-value")) return;

  // Leaving the field commits it. Escape first puts back the last committed
  // value, so nothing changes.
  if (event.key === "Enter" || event.key === "Escape") {
    event.preventDefault();
    if (event.key === "Escape") {
      event.target.value = event.target.dataset.rawValue || "";
      event.target.dataset.lastValid = event.target.value;
      updateScorePreview(event.target);
    }
    const card = event.target.closest(".class-card");
    event.target.blur();
    if (event.key === "Enter" && card) revealDomainScoreBriefly(card);
    return;
  }

  // On the last row, native Tab order is left alone.
  if (event.key === "Tab" && !event.shiftKey) {
    if (moveToNextScoreCell(event.target)) event.preventDefault();
  }
});

function createScoreRow() {
  const li = document.createElement("li");
  const label = document.createElement("label");

  const icon = document.createElement("img");
  icon.className = "letter-grade letter-grade--empty";
  icon.src = TRANSPARENT_ICON;
  icon.alt = "";

  const input = document.createElement("input");
  input.className = "score-value";
  input.type = "text";
  input.inputMode = "decimal";

  // Not a real placeholder, so it can sit further left without moving the
  // caret's starting point.
  const typeHint = document.createElement("span");
  typeHint.className = "score-type-hint";

  // Only filled when a higher Summative has replaced this Formative.
  const original = document.createElement("span");
  original.className = "score-original";

  const dateLabel = document.createElement("span");
  dateLabel.className = "score-date-label";

  const dateBtn = document.createElement("button");
  dateBtn.type = "button";
  dateBtn.className = "score-date-btn";
  dateBtn.setAttribute("aria-label", "Show date");

  const dateIcon = document.createElement("img");
  dateIcon.className = "score-date-icon";
  dateIcon.src = uiIconPath("date.png");
  dateIcon.alt = "";
  dateBtn.appendChild(dateIcon);

  // Stops the focused score from blurring, which would start the unreveal
  // animation and swallow this click.
  dateBtn.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleScoreDateCalendar(dateBtn, dateLabel);
  });

  // Not a real placeholder, so it can hold the grade circle.
  const target = document.createElement("span");
  target.className = "score-target";
  target.setAttribute("aria-hidden", "true");

  label.appendChild(icon);
  label.appendChild(typeHint);
  label.appendChild(input);
  label.appendChild(original);
  label.appendChild(dateLabel);
  label.appendChild(dateBtn);
  // Last, because applyFormativeReplacement relies on the original score
  // directly following the input.
  label.appendChild(target);
  li.appendChild(label);
  return li;
}

// Rendered into <body> so the list's scroll area doesn't clip it. Limited to
// the current school year.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const SCHOOL_YEAR_START_MONTH = 7; // August, 0-based
const SCHOOL_YEAR_END_MONTH = 6; // July, 0-based

function formatAssessmentDate(date) {
  return window.formatPreferredDate(date);
}

// Dates are saved as YYYY-MM-DD (toISODate) and formatted at render time, so
// they follow the date format setting.

function schoolYearBounds(today = new Date()) {
  const year = today.getFullYear();
  const startYear = today.getMonth() >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
  return {
    start: new Date(startYear, SCHOOL_YEAR_START_MONTH, 1),
    end: new Date(startYear + 1, SCHOOL_YEAR_END_MONTH, 1),
  };
}

let openScoreDateCalendar = null; // { button, dateLabel, panel }

function closeScoreDateCalendar() {
  if (!openScoreDateCalendar) return;
  const { button, panel } = openScoreDateCalendar;
  button.classList.remove("score-date-btn--active");
  openScoreDateCalendar = null;

  // Shrinks back into the corner it grew from. Opening another row's calendar
  // closes this first, so the two briefly cross.
  panel.classList.remove("score-date-calendar--visible");
  setTimeout(() => panel.remove(), 180);
}

// Matches the Add popup's step change in my-courses.js.
const SCORE_CALENDAR_SLIDE_MS = 220;

// direction is 1 or -1 when changing month, so the days slide; omitted on first
// open.
function renderScoreDateCalendar(panel, displayedMonth, bounds, dateLabel, direction) {
  const oldDays = direction ? panel.querySelector(".score-date-days:not(.score-date-days--leaving)") : null;
  panel.innerHTML = "";

  if (dateLabel.textContent !== "") {
    const clearRow = document.createElement("div");
    clearRow.className = "score-date-calendar-clear-row";

    const clearLabel = document.createElement("span");
    clearLabel.className = "score-date-calendar-clear-label";
    clearLabel.textContent = `Taken on ${dateLabel.textContent}`;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "score-date-calendar-clear-btn";
    clearBtn.textContent = "Remove";
    clearBtn.setAttribute("aria-label", "Remove date");
    clearBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      dateLabel.textContent = "";
      delete dateLabel.dataset.isoDate;
      const card = dateLabel.closest(".class-card");
      if (card) persistCardScores(card);
      closeScoreDateCalendar();
    });

    clearRow.appendChild(clearLabel);
    clearRow.appendChild(clearBtn);
    panel.appendChild(clearRow);
  }

  const header = document.createElement("div");
  header.className = "score-date-calendar-header";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "score-date-nav-btn";
  prevBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5L6.5 10l5.5 5.5" /></svg>';
  prevBtn.setAttribute("aria-label", "Previous month");

  const label = document.createElement("span");
  label.className = "score-date-calendar-label";
  label.textContent = `${MONTH_NAMES[displayedMonth.getMonth()]} ${displayedMonth.getFullYear()}`;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "score-date-nav-btn";
  nextBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5l5.5 5.5L8 15.5" /></svg>';
  nextBtn.setAttribute("aria-label", "Next month");

  const atStart =
    displayedMonth.getFullYear() === bounds.start.getFullYear() && displayedMonth.getMonth() === bounds.start.getMonth();
  const atEnd =
    displayedMonth.getFullYear() === bounds.end.getFullYear() && displayedMonth.getMonth() === bounds.end.getMonth();
  prevBtn.disabled = atStart;
  nextBtn.disabled = atEnd;

  // Rebuilding detaches this button mid-click, so without this the outside-
  // click handler would close the popup.
  prevBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (atStart) return;
    renderScoreDateCalendar(
      panel,
      new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1),
      bounds,
      dateLabel,
      -1
    );
  });
  nextBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (atEnd) return;
    renderScoreDateCalendar(
      panel,
      new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1),
      bounds,
      dateLabel,
      1
    );
  });

  header.append(prevBtn, label, nextBtn);
  panel.appendChild(header);

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "score-date-grid score-date-weekday-row";
  WEEKDAY_LABELS.forEach((day) => {
    const cell = document.createElement("span");
    cell.className = "score-date-weekday";
    cell.textContent = day;
    weekdayRow.appendChild(cell);
  });
  panel.appendChild(weekdayRow);

  const grid = document.createElement("div");
  grid.className = "score-date-grid score-date-days";

  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // The weeks are filled out with neighboring months' days, which can be picked
  // too.
  const addDay = (date, outside) => {
    const dayBtn = document.createElement("button");
    dayBtn.type = "button";
    dayBtn.className = "score-date-day";
    if (outside) dayBtn.classList.add("score-date-day--other-month");
    dayBtn.textContent = String(date.getDate());
    if (toISODate(date) === toISODate(today)) dayBtn.classList.add("score-date-day--today");
    if (dateLabel.dataset.isoDate === toISODate(date)) dayBtn.classList.add("score-date-day--selected");
    dayBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      // Not ringed now, while the calendar fades out; it's ringed when next
      // opened.
      dateLabel.dataset.isoDate = toISODate(date);
      dateLabel.textContent = formatAssessmentDate(date);
      const card = dateLabel.closest(".class-card");
      if (card) persistCardScores(card);
      closeScoreDateCalendar();
    });
    grid.appendChild(dayBtn);
  };

  for (let i = firstWeekday; i > 0; i--) addDay(new Date(year, month, 1 - i), true);
  for (let day = 1; day <= daysInMonth; day++) addDay(new Date(year, month, day), false);
  const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  for (let i = 1; i <= trailing; i++) addDay(new Date(year, month + 1, i), true);

  // Its own clipped window, so only the days move.
  const daysWindow = document.createElement("div");
  daysWindow.className = "score-date-days-window";
  daysWindow.appendChild(grid);
  panel.appendChild(daysWindow);
  if (oldDays) slideScoreCalendarDays(daysWindow, oldDays, grid, direction);
}

// The window eases between heights, since a month can take 5 rows or 6.
function slideScoreCalendarDays(daysWindow, oldDays, newDays, direction) {
  oldDays.classList.add("score-date-days--leaving");
  daysWindow.appendChild(oldDays);
  const from = oldDays.offsetHeight;
  const to = newDays.offsetHeight;
  if (from !== to) {
    daysWindow.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: SCORE_CALENDAR_SLIDE_MS,
      easing: "ease",
    });
  }
  const shift = 24 * direction;
  oldDays
    .animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: `translateX(${-shift}px)` },
      ],
      { duration: SCORE_CALENDAR_SLIDE_MS * 0.7, easing: "ease", fill: "forwards" }
    )
    .finished.catch(() => {})
    .finally(() => oldDays.remove());
  newDays.animate(
    [
      { opacity: 0, transform: `translateX(${shift}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ],
    { duration: SCORE_CALENDAR_SLIDE_MS, easing: "ease" }
  );
}

function openScoreDateCalendarFor(button, dateLabel) {
  const panel = document.createElement("div");
  panel.className = "score-date-calendar";
  document.body.appendChild(panel);

  const bounds = schoolYearBounds();
  const today = new Date();
  const initialMonth =
    today >= bounds.start && today < bounds.end ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(bounds.start);
  renderScoreDateCalendar(panel, initialMonth, bounds, dateLabel);

  const rect = button.getBoundingClientRect();
  const panelLeft = Math.min(rect.left, window.innerWidth - 260);
  panel.style.position = "fixed";
  panel.style.top = `${rect.bottom + 6}px`;
  panel.style.left = `${panelLeft}px`;

  // From the corner nearest the button. Near the screen's right edge the panel
  // is shifted left, which can put the button nearer its right side.
  const panelWidth = panel.getBoundingClientRect().width;
  const buttonCenterX = rect.left + rect.width / 2 - panelLeft;
  const originXPercent = Math.max(0, Math.min(100, (buttonCenterX / panelWidth) * 100));
  panel.style.transformOrigin = `${originXPercent}% 0%`;

  void panel.offsetWidth;  // so the entrance transitions
  panel.classList.add("score-date-calendar--visible");

  button.classList.add("score-date-btn--active");
  openScoreDateCalendar = { button, dateLabel, panel };
}

function toggleScoreDateCalendar(button, dateLabel) {
  const reopening = openScoreDateCalendar && openScoreDateCalendar.button === button;
  closeScoreDateCalendar();
  if (!reopening) openScoreDateCalendarFor(button, dateLabel);
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".score-date-btn") || event.target.closest(".score-date-calendar")) return;
  closeScoreDateCalendar();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openScoreDateCalendar) closeScoreDateCalendar();
});

function createAssessmentBox(labelText, percentText, rowCount = EMPTY_SCORE_ROWS) {
  const box = document.createElement("div");
  box.className = "assessment-box";
  box.dataset.baseWeight = parsePercent(percentText);

  const label = document.createElement("span");
  label.className = "assessment-label";
  label.textContent = labelText;

  const list = document.createElement("ul");
  list.className = "score-list";
  for (let i = 0; i < rowCount; i++) {
    list.appendChild(createScoreRow());
  }

  box.appendChild(label);
  box.appendChild(list);
  attachScoreScrollBlur(box, list);
  attachScoreScrollThumb(box, list);
  updateEmptyBoxPlaceholder(box);
  return box;
}

// Re-copied whenever the list changes and realigned on every scroll, in the
// same frame as a linked scroll.
function attachScoreScrollBlur(box, list) {
  const blur = document.createElement("div");
  blur.className = "score-blur";
  blur.setAttribute("aria-hidden", "true");
  blur.inert = true;
  box.appendChild(blur);
  let copy = null;

  const place = () => {
    if (!copy) return;
    copy.style.marginLeft = `${list.offsetLeft}px`;
    copy.style.width = `${list.offsetWidth}px`;
    copy.style.transform = `translateY(${-list.scrollTop}px)`;
  };

  const recopy = () => {
    copy = list.cloneNode(true);
    // A clone gets each input's original markup, not what's been typed since.
    const typed = list.querySelectorAll("input");
    copy.querySelectorAll("input").forEach((input, i) => {
      input.value = typed[i].value;
    });
    blur.replaceChildren(copy);
    place();
  };

  let frame = 0;
  const recopySoon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(recopy);
  };
  new MutationObserver(recopySoon).observe(list, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  list.addEventListener("input", recopySoon);
  list._placeScrollBlur = place;
  recopySoon();
}

// Drawn over the list's edge rather than beside it, so appearing never narrows
// the rows.
function attachScoreScrollThumb(box, list) {
  const thumb = document.createElement("div");
  thumb.className = "score-scroll-thumb";
  thumb.hidden = true;
  box.appendChild(thumb);

  const INSET = 2;
  // The list runs into the box's rounded corner; the thumb stops short of it.
  const TRACK_END_GAP = 10;
  const label = box.querySelector(".assessment-label");
  let thumbHeight = 0;
  // The list runs up under the label, so the track starts below it.
  const trackStart = () => Math.max(list.offsetTop, label.offsetTop + label.offsetHeight);
  const trackLength = () => list.offsetTop + list.clientHeight - trackStart() - TRACK_END_GAP;
  const update = () => {
    const overflow = list.scrollHeight - list.clientHeight;
    thumb.hidden = overflow <= 1;
    list._placeScrollBlur?.();
    if (thumb.hidden) return;
    thumbHeight = Math.max(24, (trackLength() * list.clientHeight) / list.scrollHeight);
    const travel = trackLength() - thumbHeight;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${trackStart() + (list.scrollTop / overflow) * travel}px`;
    thumb.style.right = `${box.clientWidth - (list.offsetLeft + list.offsetWidth) + INSET}px`;
  };

  list.addEventListener("scroll", update, { passive: true });
  // Called right after a linked scroll so the thumb moves in the same frame as
  // the rows.
  list._updateScrollThumb = update;
  new ResizeObserver(update).observe(list);
  new MutationObserver(update).observe(list, { childList: true });

  // Row contents sit above the thumb, so presses in its area are caught on the
  // list too.
  const startDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    thumb.setPointerCapture(event.pointerId);
    thumb.classList.add("score-scroll-thumb--dragging");
    const startY = event.clientY;
    const startScroll = list.scrollTop;
    const onMove = (moveEvent) => {
      const travel = trackLength() - thumbHeight;
      if (travel <= 0) return;
      const value = startScroll + ((moveEvent.clientY - startY) * (list.scrollHeight - list.clientHeight)) / travel;
      if (list._setLinkedScroll) list._setLinkedScroll(value);
      else list.scrollTop = value;
    };
    const onUp = () => {
      thumb.classList.remove("score-scroll-thumb--dragging");
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onUp);
      thumb.removeEventListener("pointercancel", onUp);
    };
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onUp);
    thumb.addEventListener("pointercancel", onUp);
  };
  thumb.addEventListener("pointerdown", startDrag);
  list.addEventListener("pointerdown", (event) => {
    if (thumb.hidden) return;
    const rect = thumb.getBoundingClientRect();
    const onThumb =
      event.clientX >= rect.left - 2 && event.clientX <= rect.right + 2 && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!onThumb) return;
    suppressNextClick = true;
    startDrag(event);
  });
  // Clicks on the box focus a row; a drag shouldn't.
  thumb.addEventListener("click", (event) => event.stopPropagation());
  let suppressNextClick = false;
  list.addEventListener(
    "click",
    (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true
  );
}

const WHEEL_LINE_PX = 16;
// Mouse-wheel notches are eased; a trackpad's small steps are applied as they
// come.
const WHEEL_NOTCH_PX = 50;

// Native scrolling moves the list under the cursor off the main thread, leaving
// the other a frame or more behind, so wheel scrolling sets both from one
// handler. Other scrolling (keyboard, focus) is mirrored from scroll events.
function linkScoreListScroll(listA, listB) {
  let position = 0;
  let target = null;
  let frame = 0;

  const maxScroll = () =>
    Math.max(listA.scrollHeight - listA.clientHeight, listB.scrollHeight - listB.clientHeight, 0);

  const setBoth = (value) => {
    position = value;
    listA.scrollTop = value;
    listB.scrollTop = value;
    listA._updateScrollThumb?.();
    listB._updateScrollThumb?.();
    listA._afterLinkedScroll?.();
    listB._afterLinkedScroll?.();
  };

  const stopEasing = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    target = null;
  };

  const easeStep = () => {
    const next = position + (target - position) * 0.3;
    if (Math.abs(target - next) < 0.5) {
      setBoth(target);
      stopEasing();
      return;
    }
    setBoth(next);
    frame = requestAnimationFrame(easeStep);
  };

  const onWheel = (event) => {
    // Pinch-zoom and sideways swipes (scrolling the cards) are left alone.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const list = event.currentTarget;
    const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? list.clientHeight : 1;
    const delta = event.deltaY * unit;
    const from = target !== null ? target : list.scrollTop;
    const to = Math.min(Math.max(from + delta, 0), maxScroll());
    // At the end already: let the page scroll instead.
    if (to === from && target === null) return;
    event.preventDefault();

    if (Math.abs(delta) >= WHEEL_NOTCH_PX) {
      if (target === null) position = list.scrollTop;
      target = to;
      if (!frame) frame = requestAnimationFrame(easeStep);
    } else {
      stopEasing();
      setBoth(to);
    }
  };

  const mirror = (source, other) => {
    if (target !== null || other.scrollTop === source.scrollTop) return;
    position = source.scrollTop;
    other.scrollTop = source.scrollTop;
  };

  [listA, listB].forEach((list) => {
    list.addEventListener("wheel", onWheel, { passive: false });
    list._setLinkedScroll = (value) => {
      stopEasing();
      setBoth(Math.min(Math.max(value, 0), maxScroll()));
    };
  });
  listA.addEventListener("scroll", () => mirror(listA, listB));
  listB.addEventListener("scroll", () => mirror(listB, listA));
}

// matchName is the division-specific name for a divided course, so its dates
// are found while the title stays plain. periodIndex lets A/B-day assessments
// count only when this period meets; null for the sample cards.
function addClassCard(name, hasFinal, matchName = name, hideable = true, periodIndex = null) {
  const card = document.createElement("div");
  card.className = "class-card";
  // For renderDomainClasses' diffing.
  card.dataset.cardName = name;
  if (periodIndex !== null) {
    card.dataset.real = "true";
    card.dataset.periodIndex = String(periodIndex);
  }

  // Sample cards have no period to show them again from, so they can't be
  // hidden.
  let hideBtn = null;
  if (hideable) {
    hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "card-hide-btn";
    hideBtn.setAttribute("aria-label", "Hide course");
    const hideIcon = document.createElement("img");
    hideIcon.className = "card-hide-icon";
    hideIcon.src = uiIconPath("hide.png");
    hideIcon.alt = "";
    hideBtn.appendChild(hideIcon);
    hideBtn.addEventListener("click", () => hideClassCard(card, name));
  }

  const title = document.createElement("h2");
  title.className = "class-name";
  title.textContent = name;
  if (periodIndex !== null) {
    title.classList.add("class-name--editable");
    title.addEventListener("click", () => openMyCoursesModal(periodIndex));
  }

  const summary = document.createElement("div");
  summary.className = "grade-summary";

  const gradeValue = document.createElement("span");
  gradeValue.className = "grade-value";
  gradeValue.textContent = "--";
  gradeValue.dataset.empty = "true";

  summary.appendChild(gradeValue);

  const breakdown = document.createElement("p");
  breakdown.className = "grade-breakdown";
  // Stacked in one grid cell so switching between them doesn't change the
  // height (see setBreakdownState).
  breakdown.dataset.state = "empty";
  const breakdownEmpty = Object.assign(document.createElement("span"), {
    className: "breakdown-empty",
    textContent: "No grades yet",
  });
  const breakdownValues = document.createElement("span");
  breakdownValues.className = "breakdown-values";
  // Hovering spells out the abbreviation.
  const breakdownSegment = (label, meaning) => {
    const segment = document.createElement("span");
    segment.className = "breakdown-segment";
    segment.append(
      `${label} `,
      Object.assign(document.createElement("span"), { className: "breakdown-value", textContent: "-" })
    );
    attachHoverTooltip(segment, meaning);
    return segment;
  };
  const breakdownDivider = () => Object.assign(document.createElement("span"), { className: "divider", textContent: "|" });
  breakdownValues.append(
    breakdownSegment("FA", "Formative Average"),
    " ",
    breakdownDivider(),
    " ",
    breakdownSegment("SA", "Summative Average"),
    " ",
    breakdownDivider(),
    " ",
    breakdownSegment("D", "Domain (unrounded)")
  );
  const breakdownSingle = document.createElement("span");
  breakdownSingle.className = "breakdown-single";
  breakdownSingle.append(
    Object.assign(document.createElement("span"), { className: "breakdown-single-label" }),
    " ",
    Object.assign(document.createElement("span"), { className: "breakdown-value", textContent: "-" })
  );
  breakdown.append(breakdownEmpty, breakdownValues, breakdownSingle);

  const nextAssessmentLine = document.createElement("p");
  nextAssessmentLine.className = "next-assessment-line";

  const groups = document.createElement("div");
  groups.className = "assessment-groups";

  const fsRow = document.createElement("div");
  fsRow.className = "assessment-fs-row";
  const formativesBox = createAssessmentBox("Formatives", "20%");
  const summativesBox = createAssessmentBox("Summatives", hasFinal ? "60%" : "80%");
  fsRow.appendChild(formativesBox);
  fsRow.appendChild(summativesBox);
  // Inside .assessment-groups so it takes from the same fixed height budget,
  // shrinking the boxes instead of growing every card in the row.
  groups.appendChild(nextAssessmentLine);
  groups.appendChild(fsRow);
  const formativeList = formativesBox.querySelector(".score-list");
  const summativeList = summativesBox.querySelector(".score-list");
  linkScoreListScroll(formativeList, summativeList);

  if (hideBtn) card.appendChild(hideBtn);
  card.appendChild(title);
  card.appendChild(summary);
  card.appendChild(breakdown);
  card.appendChild(groups);

  formativeList.addEventListener("scroll", () => repositionFormativeLinkButtons(card));
  summativeList.addEventListener("scroll", () => repositionFormativeLinkButtons(card));
  // Keeps the buttons in the same frame as a linked scroll rather than a frame
  // behind.
  formativeList._afterLinkedScroll = () => repositionFormativeLinkButtons(card);

  // Must be on the page before anything below is measured.
  document.querySelector(".classes-container").appendChild(card);

  // flex: 1 has no ceiling, so the groups' natural height is locked in. That's
  // what makes scores scroll inside a fixed box, and makes Final Exam take its
  // room from the same budget.
  const baseGroupsHeight = groups.getBoundingClientRect().height;
  groups.style.flex = `0 0 ${baseGroupsHeight}px`;
  groups.dataset.baseHeight = baseGroupsHeight;
  // recalculateGroupsForBreakdown needs to know whether the breakdown was
  // taking room when this was measured.
  groups.dataset.breakdownShownAtLock = String(document.documentElement.dataset.hideBreakdown !== "true");

  if (hasFinal) {
    const finalBox = createAssessmentBox("Final Exam", "20%", 1);
    finalBox.classList.add("assessment-box--wide");
    groups.appendChild(finalBox);
  }

  restoreCardScores(card, name);
  // Later recalculations are live changes, not the page-load restore (see
  // firstRevealStyle).
  card.dataset.settled = "true";
  updateNextAssessmentLine(card, matchName, periodIndex);
  return card;
}

const CARD_HIDE_MS = 250;

function fadeOutAndRemoveCard(card) {
  card.style.transition = `opacity ${CARD_HIDE_MS}ms ease`;
  card.style.opacity = "0";
  setTimeout(() => card.remove(), CARD_HIDE_MS);
}

// Never on the page's first render, where cards should just be there.
function fadeInCard(card) {
  card.style.opacity = "0";
  void card.offsetWidth;  // so the "0" applies first
  card.style.transition = `opacity ${CARD_HIDE_MS}ms ease`;
  card.style.opacity = "1";
  card.addEventListener(
    "transitionend",
    () => {
      card.style.transition = "";
      card.style.opacity = "";
    },
    { once: true }
  );
}

function hideClassCard(card, name) {
  const hidden = loadHiddenCourses();
  if (!hidden.includes(name)) saveHiddenCourses([...hidden, name]);

  const link = document.createElement("button");
  link.type = "button";
  link.className = "toast-link";
  link.textContent = "My Courses";
  link.addEventListener("click", () => {
    hideToast();
    openMyCoursesModal();
  });
  const message = document.createDocumentFragment();
  message.append(`${name} hidden. Show it again in `, link, ".");
  showToast(message);
  fadeOutAndRemoveCard(card);
}

const FULL_WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// null beyond 5 days out, which hides the line.
function formatRelativeAssessmentLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const daysUntil = Math.round((target - today) / 86400000);
  if (daysUntil < 0 || daysUntil > 5) return null;
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return FULL_WEEKDAY_NAMES[target.getDay()];
}

// Works whether the assessments load before or after this card exists.
function updateNextAssessmentLine(card, name, periodIndex) {
  loadAssessmentData(() => {
    const line = card.querySelector(".next-assessment-line");
    const groups = card.querySelector(".assessment-groups");
    const breakdown = card.querySelector(".grade-breakdown");
    if (!line || !groups) return;

    const baseHeight = parseFloat(groups.dataset.baseHeight);

    // Treated as nothing upcoming so the card doesn't reserve room for a hidden
    // line.
    const hiddenByPreference = document.documentElement.dataset.hideUpcomingAssessments === "true";
    const next = hiddenByPreference ? null : nearestUpcomingAnyAssessment(name, periodIndex);
    card._nextAssessmentArgs = [name, periodIndex];
    card._nextAssessmentId = next ? next.id : null;
    line.innerHTML = "";
    // Read now, not from an earlier snapshot taken before restoreCardScores
    // filled in the real values.
    const marginBefore = parseFloat(getComputedStyle(breakdown).marginBottom);
    if (!next) {
      groups.style.flex = `0 0 ${baseHeight}px`;
      repositionFormativeLinkButtons(card);
      return;
    }
    const label = formatRelativeAssessmentLabel(fromISODate(next.date));
    if (!label) {
      groups.style.flex = `0 0 ${baseHeight}px`;
      repositionFormativeLinkButtons(card);
      return;
    }

    // The date is its own span so it can be darker than the label. In-class
    // tests read as Summative; Testing Blocks keep their name.
    const typeLabel = next.type === "In-Class" ? "Summative" : next.type;
    line.append(
      `Upcoming ${typeLabel}: `,
      Object.assign(document.createElement("span"), {
        className: "next-assessment-line-date",
        textContent: label,
      })
    );

    // Read directly; a position difference would also count unrelated shifts
    // (font swap, score restore) as space this line added.
    const marginAfter = parseFloat(getComputedStyle(breakdown).marginBottom);
    const spaceAddedAbove = marginAfter - marginBefore;
    groups.style.flex = `0 0 ${baseHeight - spaceAddedAbove}px`;

    // The line just moved the rows, so their link buttons need to follow.
    repositionFormativeLinkButtons(card);
  });
}

document.querySelectorAll(".class-card").forEach(recalculateCard);

// Shared by the first render and every live update, so both filter the same
// way.
function visibleCourseCards() {
  const periods = loadPeriods();
  const divisions = loadPeriodDivisions();
  const entries = periods
    .map((name, index) => ({ name: (name || "").trim(), division: divisions[index] || "", periodIndex: index }))
    .filter((entry) => entry.name !== "");
  if (entries.length === 0) return [];

  const hidden = new Set(loadHiddenCourses());
  const cards = [];
  // Not expandCourseNames, which would lose each period's index and division.
  entries.forEach(({ name, division, periodIndex }) => {
    const course = findCourseCatalogEntry(name);
    if (course && course.combo) {
      // Both cards of a combo course share its division.
      const matchName = effectiveCourseName(name, division);
      course.combo.forEach((sub) => {
        if (!hidden.has(sub.name)) cards.push({ name: sub.name, hasFinal: sub.final, matchName, periodIndex });
      });
    } else if (!hidden.has(name)) {
      cards.push({ name, hasFinal: course ? course.final : false, matchName: effectiveCourseName(name, division), periodIndex });
    }
  });
  return cards;
}

function buildDomainEmptyState(container) {
  // So an empty account doesn't look broken. They disappear once a real course
  // exists.
  addClassCard("Course with Finals", true, undefined, false);
  addClassCard("Course without Finals", false, undefined, false);

  const hint = document.createElement("p");
  hint.className = "domain-empty-hint";
  // My Courses is a popup, so it opens directly.
  const link = document.createElement("button");
  link.type = "button";
  link.className = "domain-empty-hint-link";
  link.textContent = "My Courses";
  link.addEventListener("click", () => {
    if (typeof openMyCoursesModal === "function") openMyCoursesModal();
  });
  hint.append("Start by adding your", document.createElement("br"), "courses at ", link);
  container.appendChild(hint);
}

// Diffs against what's on screen rather than rebuilding, so unchanged cards
// never flicker; only cards that appear or disappear fade.
function renderDomainClasses(animate) {
  const container = document.querySelector('.classes-container[data-dynamic="true"]');
  if (!container) return;

  const desired = visibleCourseCards();
  const allCards = Array.from(container.querySelectorAll(".class-card"));
  const realCards = allCards.filter((card) => card.dataset.real === "true");
  const sampleCards = allCards.filter((card) => !card.dataset.real);
  const existingByName = new Map(realCards.map((card) => [card.dataset.cardName, card]));
  const desiredNames = new Set(desired.map((entry) => entry.name));

  realCards.forEach((card) => {
    if (!desiredNames.has(card.dataset.cardName)) fadeOutAndRemoveCard(card);
  });

  if (desired.length === 0) {
    if (sampleCards.length === 0) buildDomainEmptyState(container);
    return;
  }

  sampleCards.forEach((card) => card.remove());
  const hint = container.querySelector(".domain-empty-hint");
  if (hint) hint.remove();

  // Back to front, so each new card goes before the next existing one and
  // period order holds whatever order courses were added in.
  let anchor = null;
  for (let i = desired.length - 1; i >= 0; i--) {
    const entry = desired[i];
    const existing = existingByName.get(entry.name);
    if (existing) {
      existing._cardEntry = entry;
      // A division change can still change which dates it matches.
      updateNextAssessmentLine(existing, entry.matchName, entry.periodIndex);
      anchor = existing;
      continue;
    }
    const card = addClassCard(entry.name, entry.hasFinal, entry.matchName, true, entry.periodIndex);
    card._cardEntry = entry;
    card._builtFrom = savedScoresKey(entry.name);
    if (anchor) container.insertBefore(card, anchor);
    if (animate) fadeInCard(card);
    anchor = card;
  }
  markCardInClassNow();
}

// The card's min-height is a floor and nothing else grows into freed space, so
// the groups' locked budget is adjusted by however much the breakdown's room
// changed.
function recalculateGroupsForBreakdown(card) {
  const groups = card.querySelector(".assessment-groups");
  const breakdown = card.querySelector(".grade-breakdown");
  if (!groups || !breakdown || !groups.dataset.baseHeight) return;

  const breakdownShownNow = document.documentElement.dataset.hideBreakdown !== "true";
  const shownAtLock = groups.dataset.breakdownShownAtLock === "true";
  if (breakdownShownNow === shownAtLock) return;

  // Shown, measured and hidden again in one synchronous pass, so nothing
  // flashes.
  if (!breakdownShownNow) delete document.documentElement.dataset.hideBreakdown;
  const breakdownHeight = breakdown.getBoundingClientRect().height + parseFloat(getComputedStyle(breakdown).marginBottom);
  if (!breakdownShownNow) document.documentElement.dataset.hideBreakdown = "true";

  const currentBase = parseFloat(groups.dataset.baseHeight);
  const newBase = shownAtLock ? currentBase + breakdownHeight : currentBase - breakdownHeight;
  groups.dataset.baseHeight = newBase;
  groups.style.flex = `0 0 ${newBase}px`;
  groups.dataset.breakdownShownAtLock = String(breakdownShownNow);
}

// Settings changes should show at once. What's computed in JS and locked in
// place (the groups' height, the upcoming line, formatted dates) needs an
// explicit refresh.
window.addEventListener("app:preferences-changed", () => {
  document.querySelectorAll(".class-card").forEach(recalculateGroupsForBreakdown);
  renderDomainClasses(false);
  document.querySelectorAll(".score-date-label[data-iso-date]").forEach((label) => {
    label.textContent = formatAssessmentDate(fromISODate(label.dataset.isoDate));
  });
  document.querySelectorAll(".class-card[data-real]").forEach(updateTargetHints);
});

// An assessment stops being next when its class ends, a time of day rather than
// a page load, so it's re-checked periodically.
const NEXT_ASSESSMENT_CHECK_MS = 30000;

// That card's target hints stay showing, not just on hover.
function markCardInClassNow() {
  const now = typeof currentScheduleBlock === "function" ? currentScheduleBlock() : null;
  const periodIndex = now && now.block.type === "class" ? now.block.periodIndex : null;
  document.querySelectorAll(".class-card[data-period-index]").forEach((card) => {
    card.classList.toggle("class-card--in-class", Number(card.dataset.periodIndex) === periodIndex);
  });
  syncPinnedCurrentCard(periodIndex);
}

// The class in session gets a working copy at the far left, behind a gray bar,
// so it's easy to reach. Edits to either card rebuild the other (see
// syncTwinCard). data-pinned keeps the copy out of the GPA list and
// renderDomainClasses' bookkeeping.

// Lets a twin skip rebuilding when nothing it was built from changed.
function savedScoresKey(name) {
  return JSON.stringify(loadDomainScores()[name] || null);
}

function buildPinnedCopy(original) {
  const entry = original._cardEntry;
  const copy = addClassCard(entry.name, entry.hasFinal, entry.matchName, false, entry.periodIndex);
  copy.dataset.real = "pinned";
  copy.dataset.pinned = "true";
  copy._cardEntry = entry;
  copy._builtFrom = savedScoresKey(entry.name);
  return copy;
}

function syncPinnedCurrentCard(periodIndex) {
  const container = document.querySelector('.classes-container[data-dynamic="true"]');
  if (!container) return;
  const originals =
    periodIndex === null
      ? []
      : Array.from(container.querySelectorAll('.class-card[data-real="true"]')).filter(
          (card) => Number(card.dataset.periodIndex) === periodIndex && card._cardEntry
        );
  const realCards = Array.from(container.querySelectorAll('.class-card[data-real="true"]'));
  // Already first: no copy, just the bar after it.
  const alreadyFirst = originals.length > 0 && originals.every((card, i) => realCards[i] === card);
  const pinned = Array.from(container.querySelectorAll(".class-card[data-pinned]"));
  const oldDivider = container.querySelector(".domain-current-divider");
  const wanted = alreadyFirst ? [] : originals;
  const same =
    pinned.length === wanted.length &&
    pinned.every((card, i) => card.dataset.cardName === wanted[i].dataset.cardName) &&
    Boolean(oldDivider) === originals.length > 0 &&
    (!alreadyFirst || oldDivider.previousElementSibling === originals[originals.length - 1]);
  if (same) return;

  pinned.forEach((card) => card.remove());
  if (oldDivider) oldDivider.remove();
  container
    .querySelectorAll(".class-card--current-label")
    .forEach((card) => card.classList.remove("class-card--current-label"));
  if (originals.length === 0) return;

  const divider = document.createElement("div");
  divider.className = "domain-current-divider";
  divider.setAttribute("aria-hidden", "true");
  // Every card for the period is labeled, as a period can hold more than one
  // course (two Korean courses in the same slot, say).
  if (alreadyFirst) {
    originals[originals.length - 1].after(divider);
    originals.forEach((card) => card.classList.add("class-card--current-label"));
    return;
  }
  container.prepend(divider);
  originals
    .slice()
    .reverse()
    .forEach((original) => {
      const copy = buildPinnedCopy(original);
      copy.classList.add("class-card--in-class");
      container.prepend(copy);
    });
  container.querySelectorAll(".class-card[data-pinned]").forEach((card) => card.classList.add("class-card--current-label"));
}

// Skipped when nothing changed, which also stops the rebuilt card's own save
// bouncing back.
let syncingTwinCard = false;
function syncTwinCard(card) {
  if (syncingTwinCard) return;
  const container = card.closest(".classes-container");
  if (!container || !container.querySelector(".class-card[data-pinned]")) return;
  const name = card.dataset.cardName;
  const key = savedScoresKey(name);
  card._builtFrom = key;
  const twin = Array.from(container.querySelectorAll(".class-card")).find(
    (other) => other !== card && other.dataset.cardName === name && other._cardEntry
  );
  if (!twin || twin._builtFrom === key) return;

  syncingTwinCard = true;
  try {
    const rebuilt = twin.dataset.pinned
      ? buildPinnedCopy(twin)
      : addClassCard(twin._cardEntry.name, twin._cardEntry.hasFinal, twin._cardEntry.matchName, true, twin._cardEntry.periodIndex);
    if (!twin.dataset.pinned) rebuilt._cardEntry = twin._cardEntry;
    rebuilt._builtFrom = savedScoresKey(name);
    rebuilt.classList.toggle("class-card--in-class", twin.classList.contains("class-card--in-class"));
    rebuilt.classList.toggle("class-card--current-label", twin.classList.contains("class-card--current-label"));
    twin.replaceWith(rebuilt);
  } finally {
    syncingTwinCard = false;
  }
  // The rebuild saved the GPA list while both old and new cards were present.
  saveDomainSnapshot();
}

function refreshNextAssessmentLines() {
  markCardInClassNow();
  if (document.documentElement.dataset.hideUpcomingAssessments === "true") return;
  document.querySelectorAll(".class-card").forEach((card) => {
    if (!card._nextAssessmentArgs) return;
    const [name, periodIndex] = card._nextAssessmentArgs;
    const next = nearestUpcomingAnyAssessment(name, periodIndex);
    if ((next ? next.id : null) !== card._nextAssessmentId) updateNextAssessmentLine(card, name, periodIndex);
  });
}

function initDomainPage() {
  const dynamicClassesContainer = document.querySelector('.classes-container[data-dynamic="true"]');
  if (!dynamicClassesContainer) return;
  setInterval(refreshNextAssessmentLines, NEXT_ASSESSMENT_CHECK_MS);
  // Rather than waiting for the first periodic check.
  if (typeof loadScheduleData === "function") loadScheduleData(markCardInClassNow);

  // Reset on every scroll event so the scrollbar stays through a long scroll.
  let classesScrollingTimeout = null;
  // Also called by the rubber band, so the scrollbar shows while it stretches.
  dynamicClassesContainer._showScrollbar = (ms = 800) => {
    dynamicClassesContainer.classList.add("classes-container--scrolling");
    clearTimeout(classesScrollingTimeout);
    classesScrollingTimeout = setTimeout(() => {
      dynamicClassesContainer.classList.remove("classes-container--scrolling");
    }, ms);
  };
  dynamicClassesContainer.addEventListener("scroll", () => {
    if (dynamicClassesContainer._buttonScrolling) return;
    dynamicClassesContainer._showScrollbar();
  });

  initCardScrollButtons(dynamicClassesContainer);
  initClassesScrollbar(dynamicClassesContainer);
  initClassesOverscroll(dynamicClassesContainer);

  // Cards present on page load should just be there.
  renderDomainClasses(false);

  const loading = document.getElementById("domain-loading");
  if (loading) loading.hidden = true;
}

// Chrome only rubber-bands the page itself, so the cards' row gets its own.
// Wheel events don't say whether they're fingers or momentum, so the scroll's
// history decides: one still moving the row when it reaches the end is a flick
// arriving, which stops there with a single bounce and has its remaining events
// ignored. One starting at the end is a push, which stretches until it turns
// into momentum (steps that stop growing; trackpads repeat whole-pixel values)
// or stops, then springs back.
const OVERSCROLL_MAX_PX = 90; // approached, never passed, however hard it's pushed
const OVERSCROLL_RESISTANCE = 0.55; // how quickly the pull stiffens, as iOS's
const OVERSCROLL_RELEASE_MS = 50; // no more pushing for this long: spring back
// Critically damped, so it returns as fast as it can without swinging past.
// Position over time from x0 moving at v0: (x0 + (v0 + w * x0) * t) * e^(-w *
// t).
const OVERSCROLL_SPRING_W = 13;
const OVERSCROLL_SETTLE_PX = 0.4; // closer than this to rest: at rest
const OVERSCROLL_VELOCITY_GAP_MS = 100; // a longer gap starts a fresh gesture
const OVERSCROLL_MOMENTUM_STEPS = 3; // steps in a row that didn't grow...
const OVERSCROLL_MOMENTUM_SHRINKS = 2; // ...of which this many shrank: momentum
const OVERSCROLL_ARRIVAL_PUSH = 4; // an arriving flick's bounce: its last step x this, banded
// Past this, the push is spent rather than piling up out of sight.
const OVERSCROLL_LIMIT_SHARE = 0.95;

function initClassesOverscroll(container) {
  // How far scrolling has pushed past the edge, and how far that shows.
  let pushed = 0;
  let shown = 0;
  let releaseTimer = 0;
  let springing = null; // { start, x0, v0, animations }
  let lastTime = 0;
  let lastStep = 0;
  let steady = 0;
  let shrank = 0;
  // So the rest of a flick can't push the row out again after it's sprung back.
  let spentFlick = false;
  let streamMoved = false;

  // Set on each card rather than via a custom property on the row, which every
  // element in every card inherits, restyling them all each frame.
  const show = (px) => {
    shown = px;
    const value = px ? `${-px}px 0` : "";
    for (const child of container.children) child.style.translate = value;
    container._overscrollStretch = px;
    if (container._placeScrollbar) container._placeScrollbar();
    if (px && container._showScrollbar) container._showScrollbar();
  };
  // Diminishing returns, approaching OVERSCROLL_MAX_PX.
  const band = (distance) => {
    const pull = 1 - 1 / ((Math.abs(distance) * OVERSCROLL_RESISTANCE) / OVERSCROLL_MAX_PX + 1);
    return Math.sign(distance) * pull * OVERSCROLL_MAX_PX;
  };
  const springAt = (x0, v0, t) => (x0 + (v0 + OVERSCROLL_SPRING_W * x0) * t) * Math.exp(-OVERSCROLL_SPRING_W * t);
  // Leaves the row where it had got to, so a fresh push carries on from there.
  const stopSpring = () => {
    if (!springing) return;
    const { start, x0, v0, animations } = springing;
    springing = null;
    animations.forEach((animation) => animation.cancel());
    show(springAt(x0, v0, (performance.now() - start) / 1000));
  };
  // The whole path is known up front, so it's handed to the browser as one
  // animation per card, which runs on the compositor: smooth however busy the
  // page is, with no card redrawn. Updating it frame by frame dropped frames
  // while a flick's momentum was still arriving.
  const spring = (x0, v0) => {
    clearTimeout(releaseTimer);
    stopSpring();
    pushed = 0;
    if (!x0 && !v0) {
      show(0);
      return;
    }
    const stretches = [];
    for (let t = 0; ; t += 1 / 120) {
      const x = springAt(x0, v0, t);
      if (Math.abs(x) < OVERSCROLL_SETTLE_PX && t > 1 / OVERSCROLL_SPRING_W) {
        stretches.push(0);
        break;
      }
      stretches.push(x);
    }
    const keyframes = stretches.map((x) => ({ translate: x ? `${-x}px 0` : "0px 0" }));
    const duration = ((keyframes.length - 1) * 1000) / 120;
    show(0); // the animations show the motion; the cards' own value is rest
    const animations = Array.from(container.children, (child) =>
      child.animate(keyframes, { duration, easing: "linear" })
    );
    const thumb = container._scrollbarThumb;
    if (thumb && container._scrollbarTransform) {
      animations.push(
        thumb.animate(
          stretches.map((x) => ({ transform: container._scrollbarTransform(x) })),
          { duration, easing: "linear" }
        )
      );
      if (container._showScrollbar) container._showScrollbar(duration + 800);
    }
    const current = { start: performance.now(), x0, v0, animations };
    springing = current;
    if (animations[0]) {
      animations[0].finished
        .then(() => {
          if (springing === current) springing = null;
        })
        .catch(() => {});
    }
  };
  // One motion out and back: a critically damped spring starting at rest with
  // speed v peaks at v / (w * e).
  const bump = (peak) => {
    stopSpring();
    spring(shown, (peak - shown) * OVERSCROLL_SPRING_W * Math.E);
  };
  const springBack = () => {
    stopSpring();
    spring(shown, 0);
  };

  container.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const dx = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const now = event.timeStamp || performance.now();
      const dt = now - lastTime;
      const step = Math.abs(dx);
      const sameStream = dt < OVERSCROLL_VELOCITY_GAP_MS && Math.sign(dx) === Math.sign(lastStep);
      if (!sameStream) {
        streamMoved = false;
        spentFlick = false;
      }
      if (sameStream && step <= Math.abs(lastStep)) {
        steady += 1;
        if (step < Math.abs(lastStep)) shrank += 1;
      } else {
        steady = 0;
        shrank = 0;
      }
      lastStep = dx;
      lastTime = now;
      const momentum = steady >= OVERSCROLL_MOMENTUM_STEPS && shrank >= OVERSCROLL_MOMENTUM_SHRINKS;
      if (spentFlick) return;

      const max = container.scrollWidth - container.clientWidth;
      if (max <= 1) return;
      const atStart = container.scrollLeft <= 0.5;
      const atEnd = container.scrollLeft >= max - 0.5;
      const intoEdge = (dx < 0 && atStart) || (dx > 0 && atEnd);
      const stretched = pushed !== 0;
      if (!intoEdge) streamMoved = true;
      if (!stretched && !intoEdge) return;

      // A flick arriving: it stops here with one bounce sized by its speed.
      if (intoEdge && streamMoved && !stretched) {
        spentFlick = true;
        bump(band(Math.sign(dx) * step * OVERSCROLL_ARRIVAL_PUSH));
        return;
      }

      stopSpring();
      const next = pushed + dx;
      if (stretched && Math.sign(next) !== Math.sign(pushed)) {
        pushed = 0;
        show(0);
        return;
      }
      pushed = next;
      show(band(pushed));

      // Otherwise the push would pile up beyond what can be shown, and a scroll
      // back would have to work through it first.
      if (Math.abs(shown) >= OVERSCROLL_MAX_PX * OVERSCROLL_LIMIT_SHARE) {
        spentFlick = true;
        springBack();
        return;
      }

      if (momentum) {
        spentFlick = true;
        springBack();
        return;
      }
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(springBack, OVERSCROLL_RELEASE_MS);
    },
    // Passive so scrolling never waits on this; a cancellable listener made
    // every scroll lag. Nothing needs cancelling, and overscroll-behavior-x
    // keeps the browser's swipe-back out.
    { passive: true }
  );
}

// Sized and placed as a native scrollbar would be.
function initClassesScrollbar(container) {
  const thumb = document.querySelector(".classes-scrollbar-thumb");
  if (!thumb) return;
  // A stretch past either end shortens the thumb, as a page's does, keeping
  // it against that end: by as many pixels as the row is stretched (a
  // native thumb's proportional shrink would barely show on a row this
  // much wider than the screen), down to 30% of its length. Scaled rather
  // than resized, so the rubber band's spring can animate it on the
  // compositor along with the cards.
  // The track stops SCROLLBAR_INSET_PX short of either side.
  const SCROLLBAR_INSET_PX = 5;
  const trackWidth = () => container.clientWidth - 2 * SCROLLBAR_INSET_PX;
  // Where browsers can, the thumb follows the scroll through a scroll-driven
  // CSS animation (see .classes-scrollbar-thumb), which the browser runs
  // alongside the scrolling itself. Moved from scroll events, it fell
  // behind on fast scrolls, since those reach this code later than the
  // scrolling happens. Here it only needs its size and travel.
  const scrollDriven = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
  // The stretch's shortening, on top of where the scroll has the thumb.
  const transformFor = (stretch) => {
    const track = trackWidth();
    const total = container.scrollWidth;
    const base = (container.clientWidth / total) * track;
    const at = scrollDriven ? "" : `translateX(${SCROLLBAR_INSET_PX + (container.scrollLeft / total) * track}px) `;
    if (!stretch) return at || "none";
    const width = Math.max(base * 0.3, base - Math.abs(stretch));
    const shift = stretch < 0 ? 0 : base - width;
    return `${at}translateX(${shift}px) scaleX(${width / base})`;
  };
  const place = () => {
    const total = container.scrollWidth;
    if (total <= container.clientWidth + 1) {
      thumb.style.width = "0px";
      return;
    }
    const width = (container.clientWidth / total) * trackWidth();
    thumb.style.width = `${width}px`;
    thumb.style.setProperty("--thumb-from", `${SCROLLBAR_INSET_PX}px`);
    thumb.style.setProperty("--thumb-to", `${SCROLLBAR_INSET_PX + trackWidth() - width}px`);
    thumb.style.transform = transformFor(container._overscrollStretch || 0);
  };
  container._scrollbarThumb = thumb;
  container._scrollbarTransform = transformFor;
  container._placeScrollbar = place;
  if (!scrollDriven) container.addEventListener("scroll", place, { passive: true });
  window.addEventListener("resize", place);
  new MutationObserver(place).observe(container, { childList: true });
  place();

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    thumb.classList.add("classes-scrollbar-thumb--dragging");
    const startX = event.clientX;
    const startScroll = container.scrollLeft;
    const ratio = container.scrollWidth / trackWidth();
    const move = (moveEvent) => {
      container.scrollLeft = startScroll + (moveEvent.clientX - startX) * ratio;
    };
    const end = () => {
      thumb.classList.remove("classes-scrollbar-thumb--dragging");
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", end);
      thumb.removeEventListener("pointercancel", end);
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", end);
  });
}

// At either end the button does nothing rather than wrapping around.
function initCardScrollButtons(container) {
  const nav = document.getElementById("domain-card-nav");
  const prev = document.getElementById("domain-card-prev");
  const next = document.getElementById("domain-card-next");
  if (!nav || !prev || !next) return;

  const cardStep = () => {
    const card = container.querySelector(".class-card");
    if (!card) return 0;
    return card.offsetWidth + (parseFloat(getComputedStyle(container).columnGap) || 0);
  };
  const maxScroll = () => container.scrollWidth - container.clientWidth;

  // Still clickable, but with no tint, so it doesn't look like it would do
  // anything.
  const markEnds = () => {
    const now = pendingTarget === null ? container.scrollLeft : pendingTarget;
    prev.classList.toggle("domain-card-nav-btn--at-end", now <= 1);
    next.classList.toggle("domain-card-nav-btn--at-end", now >= maxScroll() - 1);
  };
  const update = () => {
    const overflowing = maxScroll() > 1 && cardStep() > 0;
    nav.hidden = !overflowing;
    if (overflowing) markEnds();
  };

  // Button scrolls don't show the scrollbar. scrollend clears the flag, with a
  // timeout where it isn't supported.
  let buttonScrollTimer = null;
  // A click mid-glide steps on from where the glide is headed, not where the
  // row is, which would land on the same card again.
  let pendingTarget = null;
  const endButtonScroll = () => {
    container._buttonScrolling = false;
    pendingTarget = null;
    clearTimeout(buttonScrollTimer);
  };
  container.addEventListener("scrollend", endButtonScroll);
  const scrollTo = (left) => {
    if (Math.abs(left - container.scrollLeft) < 1) return;
    container._buttonScrolling = true;
    pendingTarget = left;
    clearTimeout(buttonScrollTimer);
    buttonScrollTimer = setTimeout(endButtonScroll, 1500);
    container.scrollTo({ left, behavior: "smooth" });
    markEnds();
  };

  // Measured from each card's own position, so the gray bar after the pinned
  // card doesn't throw the steps off.
  const step = (direction) => {
    const max = maxScroll();
    const now = pendingTarget === null ? container.scrollLeft : pendingTarget;
    if (direction < 0 && now <= 1) return;
    if (direction > 0 && now >= max - 1) return;
    const first = container.querySelector(".class-card");
    if (!first) return;
    const stops = Array.from(container.querySelectorAll(".class-card")).map(
      (card) => card.offsetLeft - first.offsetLeft
    );
    const target =
      direction > 0
        ? stops.find((left) => left > now + 1)
        : stops.filter((left) => left < now - 1).pop();
    scrollTo(Math.max(0, Math.min(target === undefined ? (direction > 0 ? max : 0) : target, max)));
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  // Each step joins the glide already under way.
  const KEY_HOLD_DELAY_MS = 300;
  const KEY_HOLD_STEP_MS = 220;
  let heldKey = null;
  let keyHoldTimer = null;
  const startKeyHold = (key) => {
    heldKey = key;
    const direction = key === "ArrowLeft" ? -1 : 1;
    (direction < 0 ? prev : next).classList.add("domain-card-nav-btn--pressed");
    step(direction);
    keyHoldTimer = setTimeout(function repeat() {
      step(direction);
      keyHoldTimer = setTimeout(repeat, KEY_HOLD_STEP_MS);
    }, KEY_HOLD_DELAY_MS);
  };
  const stopKeyHold = () => {
    clearTimeout(keyHoldTimer);
    heldKey = null;
    prev.classList.remove("domain-card-nav-btn--pressed");
    next.classList.remove("domain-card-nav-btn--pressed");
  };

  // Not while the arrows are moving a text cursor or a popup is open.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (nav.hidden) return;
    const target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable]")) return;
    // Every popup's backdrop is a "...-overlay".
    if (openScoreDateCalendar || document.querySelector('[class*="-overlay"]')) return;
    event.preventDefault();
    // Auto-repeat fires much faster than a card can glide, and each repeat
    // restarting the glide stuttered, so holding a key steps at its own pace
    // instead.
    if (event.repeat || heldKey) return;
    startKeyHold(event.key);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === heldKey) stopKeyHold();
  });
  window.addEventListener("blur", () => stopKeyHold());

  container.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  new MutationObserver(update).observe(container, { childList: true });
  update();
}

// Posts are fetched once rather than cached and confirmed like assessments;
// they change rarely enough that a brief delay is fine.

function buildDomainPostCard(post) {
  const card = document.createElement("div");
  card.className = "domain-post-card";

  const title = document.createElement("h3");
  title.className = "domain-post-title";
  title.textContent = post.title;
  card.appendChild(title);

  const body = document.createElement("p");
  body.className = "domain-post-body";
  body.textContent = post.body;
  card.appendChild(body);

  if (post.linkUrl) {
    const link = document.createElement("a");
    link.className = "domain-post-link";
    link.href = post.linkUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Learn More →";
    card.appendChild(link);
  }

  return card;
}

function renderDomainPosts(posts) {
  const container = document.getElementById("domain-posts");
  if (!container) return;

  if (posts.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.innerHTML = "";
  posts
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((post) => container.appendChild(buildDomainPostCard(post)));
  container.hidden = false;
}

function fetchDomainPosts() {
  if (typeof firebase === "undefined" || !firebase.firestore) return;
  firebase
    .firestore()
    .collection("posts")
    .get()
    .then((snapshot) => renderDomainPosts(snapshot.docs.map((doc) => doc.data())))
    .catch((error) => console.error("Failed to load posts:", error));
}

fetchDomainPosts();
