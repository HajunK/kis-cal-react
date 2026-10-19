/* global HOVER_TOOLTIP_EDGE_GAP, hideHoverTooltip */

// The first time a typed Summative takes over a Formative, a short tour walks
// through the link: the Formative's new score, then the original kept beside
// it. Each step waits for OK. Shown until both have been OK'd, once per
// account. Carried over from domain.js unchanged: a tip in <body> that
// follows its target every frame.

const FORMATIVE_LINK_TIP_POINTER_PX = 6;
const FORMATIVE_LINK_TIP_RADIUS_PX = 8;

// Where the input's text sits, measured with its own font, since the box is
// wider than the number in it.
let scoreTextCanvas = null;
function scoreTextCenterX(input, rect) {
  scoreTextCanvas = scoreTextCanvas || document.createElement("canvas").getContext("2d");
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

let formativeLinkTip = null;

export function showFormativeLinkTipOnce(formativeInput) {
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
    const inView = rect.width > 0 && (!listRect || (rowMid > listRect.top && rowMid < listRect.bottom));
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
