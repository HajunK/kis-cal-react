/* global animateNumberChange, ROLL_DURATION_MS, ROLL_STAGGER_MS, uiIconPath, loadAssessmentData, nearestUpcomingAnyAssessment */

// The Domain cards' motion and measured layout, carried over from domain.js
// unchanged, so number rolls, the Formative swap, the badge crossfade and the
// card fades look exactly as they did. They work on the elements ClassCard
// renders and leaves to them: the grade, breakdown and next-assessment line's
// text, styles set while something animates, and overlays laid over a row.

import { fromISODate } from "../core/dates.js";
import { gradeIconPath, letterGradeForScore, truncateToTwoDecimals } from "../core/grades.js";
import { formatRelativeAssessmentLabel } from "./model.js";

// The blurred copy (see attachScoreScrollBlur) has inputs too.
export const SCORE_INPUT = ".score-value:not(.score-blur *)";

// An <img> with no src shows the broken-image icon.
export const TRANSPARENT_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export const DOMAIN_BADGE_FADE_MS = 200;
const BOX_INDEX = { formative: 0, summative: 1, final: 2 };

// A cell's input, by box and row.
export function cellInput(card, box, row) {
  const boxEl = card && card.querySelectorAll(".assessment-box")[BOX_INDEX[box]];
  return boxEl ? boxEl.querySelector(".score-list").querySelectorAll(SCORE_INPUT)[row] || null : null;
}

// A copy of the old icon fades out over the updated one, like the big badge's
// tier change.
export function dissolveScoreIcon(icon, oldSrc) {
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

// The icon's src for a cell's icon state, as the <img> reports it.
export function iconSrc(icon) {
  return new URL(icon ? gradeIconPath(icon.slug) : TRANSPARENT_ICON, document.baseURI).href;
}

// An <input> can't hold the roll, so a matching span is laid over it while
// the input's text is hidden.
export function rollScoreInput(input, oldText, newText) {
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

export function revealScoreRowBriefly(row) {
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

// An <input> colors all its text at once, so while a "/" is typed, a copy of
// the text is laid over it with the slash grayed.
export function updateFractionOverlay(input) {
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
    if (!input._fractionScrollListener) {
      input._fractionScrollListener = true;
      input.addEventListener("scroll", () => updateFractionOverlay(input));
    }
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

const FORMATIVE_REVEAL_MS = 280;
const FORMATIVE_DATE_ICON_FADE_MS = 120;

// Moves between a linked Formative (the Summative's score in the input, its
// own score small beside it) and an unlinked one (its own score in the
// input). The small number grows into the input's place while the
// Summative's slides off, FLIP-style, since they're separate elements.
//
// The input already holds its real value throughout and its text is hidden;
// the outgoing number is a stand-in span. Both moves are Web Animations, so a
// swap called again mid-way (spam clicking the link button) reverses them
// from where they are instead of jumping. onUnlinked runs once it settles
// unlinked, to empty the original score (which the swap kept showing).
export function animateFormativeSwap(input, originalSpan, toLinked, linkedText, onUnlinked) {
  const swap = input._swap;
  if (swap) {
    if (swap.toLinked !== toLinked) {
      swap.toLinked = toLinked;
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

  input._swap = { toLinked, ghost, ghostAnim, spanAnim, row, dateBtn, originalSpan };
  // finish fires again after each reversal; only a settled swap ends.
  ghostAnim.addEventListener("finish", () => {
    const current = input._swap;
    if (!current || current.ghostAnim !== ghostAnim || ghostAnim.playState !== "finished") return;
    endFormativeSwap(input);
    if (!current.toLinked) onUnlinked();
  });
}

// Drops a swap in place, for when the row is about to be set without one.
export function endFormativeSwap(input) {
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

// After Enter under Privacy Blur, the big grade stays visible until its roll
// has finished, so the change can be seen.
const domainRevealTimers = new WeakMap();
const DOMAIN_REVEAL_LINGER_MS = 200;

export function revealDomainScoreBriefly(card) {
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

// Must match the fade heights in domain-scores.css (.assessment-
// box::before/::after).
const LINK_BTN_TOP_FADE_PX = 14;
const LINK_BTN_BOTTOM_FADE_PX = 36;
// Matches .formative-link-btn's mask-size/position and covers its shadow.
const LINK_BTN_MASK_BLEED_PX = 12;

export function positionFormativeLinkButton(groups, formativeInput, btn) {
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

  // The rows fade under surface-colored overlays, but the button sits over
  // the box borders, which an overlay would hide too, so it gets a mask in its
  // own pixels instead.
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

// Each button knows its row (see LinkButton in ClassCard.jsx).
export function repositionFormativeLinkButtons(card) {
  const groups = card.querySelector(".assessment-groups");
  groups.querySelectorAll(".formative-link-btn").forEach((btn) => {
    const input = cellInput(card, "formative", btn._row);
    if (input) positionFormativeLinkButton(groups, input, btn);
  });
}

// The grade, its badge and the FA/SA/D breakdown, drawn as recalculating
// left them. "instant" while a card restores its saved scores (page load
// shouldn't animate), "blur" after.

function setBreakdownValue(card, index, value, revealStyle) {
  const span = card.querySelectorAll(".breakdown-values .breakdown-value")[index];
  if (!span) return;
  animateNumberChange(span, value === null ? "-" : truncateToTwoDecimals(value), revealStyle);
}

function setBreakdownSingle(card, label, value, revealStyle) {
  const single = card.querySelector(".breakdown-single");
  if (!single) return;
  single.querySelector(".breakdown-single-label").textContent = label;
  animateNumberChange(single.querySelector(".breakdown-value"), truncateToTwoDecimals(value), revealStyle);
}

function setBreakdownState(card, state, settled) {
  const breakdown = card.querySelector(".grade-breakdown");
  if (!breakdown || breakdown.dataset.state === state) return false;
  const instant = !settled;
  if (instant) breakdown.classList.add("grade-breakdown--instant");
  breakdown.dataset.state = state;
  if (instant) {
    void breakdown.offsetWidth;  // so the swap applies with transitions off
    breakdown.classList.remove("grade-breakdown--instant");
  }
  return true;
}

// Cleared on every new crossfade so an older one's delayed cleanup can't put
// a stale tier back.
const badgeFadeTimeouts = new WeakMap();

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

function updateDomainBadge(card, domain, revealStyle) {
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
    animateNumberChange(gradeValueEl, "--", revealStyle);
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
  animateNumberChange(gradeValueEl, String(rounded), revealStyle);
}

// With nothing scored, the numbers stay hidden behind "No grades yet";
// rolling them to "-" would only flash.
export function showCardGrades(card, { faAverage, saAverage, domain, onlyAverage }, settled) {
  const revealStyle = settled ? "blur" : "instant";
  if (domain === null) {
    setBreakdownState(card, "empty", settled);
  } else if (onlyAverage !== null) {
    // A layer swapping in already fades from blur as a whole, so its number
    // shouldn't blur in again.
    const style = setBreakdownState(card, "single", settled) ? "instant" : revealStyle;
    setBreakdownSingle(card, faAverage !== null ? "Formative Average" : "Summative Average", onlyAverage, style);
  } else {
    const style = setBreakdownState(card, "values", settled) ? "instant" : revealStyle;
    setBreakdownValue(card, 0, faAverage, style);
    setBreakdownValue(card, 1, saAverage, style);
    setBreakdownValue(card, 2, domain, style);
  }
  updateDomainBadge(card, domain, revealStyle);
}

// The badge a card's grade earns, as the GPA tab's "Paste from Domain Tab"
// lists it (domainSnapshot).
export function badgeFor(domain) {
  if (domain === null) return { slug: null, label: null };
  const tier = letterGradeForScore(Math.round(domain));
  return { slug: tier.slug, label: tier.label };
}

// flex: 1 has no ceiling, so the groups' natural height is locked in. That's
// what makes scores scroll inside a fixed box, and makes Final Exam take its
// room from the same budget (it's added only after this).
export function lockGroupsHeight(card) {
  const groups = card.querySelector(".assessment-groups");
  const baseGroupsHeight = groups.getBoundingClientRect().height;
  groups.style.flex = `0 0 ${baseGroupsHeight}px`;
  groups.dataset.baseHeight = baseGroupsHeight;
  // recalculateGroupsForBreakdown needs to know whether the breakdown was
  // taking room when this was measured.
  groups.dataset.breakdownShownAtLock = String(document.documentElement.dataset.hideBreakdown !== "true");
}

// Works whether the assessments load before or after this card exists. meta
// keeps what refreshNextAssessmentLines checks against.
export function updateNextAssessmentLine(card, name, periodIndex, meta) {
  loadAssessmentData(() => {
    const line = card.querySelector(".next-assessment-line");
    const groups = card.querySelector(".assessment-groups");
    const breakdown = card.querySelector(".grade-breakdown");
    if (!line || !groups) return;

    const baseHeight = parseFloat(groups.dataset.baseHeight);

    // Treated as nothing upcoming so the card doesn't reserve room for a
    // hidden line.
    const hiddenByPreference = document.documentElement.dataset.hideUpcomingAssessments === "true";
    const next = hiddenByPreference ? null : nearestUpcomingAnyAssessment(name, periodIndex);
    meta.nextAssessmentArgs = [name, periodIndex];
    meta.nextAssessmentId = next ? next.id : null;
    line.innerHTML = "";
    // Read now, not from an earlier snapshot taken before the saved scores
    // were filled in.
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

// The card's min-height is a floor and nothing else grows into freed space,
// so the groups' locked budget is adjusted by however much the breakdown's
// room changed.
export function recalculateGroupsForBreakdown(card) {
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

export const CARD_HIDE_MS = 250;

export function fadeOutCard(card) {
  card.style.transition = `opacity ${CARD_HIDE_MS}ms ease`;
  card.style.opacity = "0";
}

// Never on the page's first render, where cards should just be there.
export function fadeInCard(card) {
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

export const uiIcon = (name) => uiIconPath(name);
