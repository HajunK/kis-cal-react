// Shared by every data page: icons, the number roll, and appData with its
// cloud sync. The grading scale and appData's shape are in src/core.

function themeFolder() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// gradeIconPath is src/core/grades.js.

function uiIconPath(name) {
  return `icons/${themeFolder()}/${name}`;
}

// Kept as the one place a theme switch refreshes grade icons from, though only
// their CSS background differs now.
window.refreshGradeIcons = function refreshGradeIcons() {
  document.querySelectorAll(".letter-grade[data-slug]").forEach((img) => {
    img.src = gradeIconPath(img.dataset.slug);
  });
};

// Already-drawn icons would keep the old theme's file until a reload, so their
// src is swapped in place.
window.refreshUiIcons = function refreshUiIcons() {
  const folder = themeFolder();
  document.querySelectorAll('img[src*="icons/light/"], img[src*="icons/dark/"]').forEach((img) => {
    img.src = img.src.replace(/icons\/(light|dark)\//, `icons/${folder}/`);
  });
};

// So rapid updates restart cleanly instead of stacking cleanup timers.
const numberAnimations = new WeakMap();

const ROLL_DURATION_MS = 800;
const ROLL_STAGGER_MS = 60; // delay between each digit (left to right) settling
// A ticking countdown's roll, all digits at once (see animateNumberChange).
const COUNTDOWN_ROLL_MS = 450;

function measureCharWidth(referenceEl, char) {
  return measureCharWidths(referenceEl, char)[0];
}

// Measured within the whole string so kerning between neighbors counts,
// matching the plain text the roll ends on.
function measureCharWidths(referenceEl, text) {
  if (text.length === 0) return [];

  const style = getComputedStyle(referenceEl);
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  probe.style.fontFamily = style.fontFamily;
  probe.style.fontSize = style.fontSize;
  probe.style.fontWeight = style.fontWeight;
  probe.style.fontStyle = style.fontStyle;
  // Digit widths depend on these (tabular-nums especially); without them the
  // slots would be sized for the wrong digits.
  probe.style.fontVariantNumeric = style.fontVariantNumeric;
  probe.style.fontFeatureSettings = style.fontFeatureSettings;
  probe.style.letterSpacing = style.letterSpacing;
  document.body.appendChild(probe);

  const textNode = probe.firstChild;
  const range = document.createRange();
  const widths = [];
  for (let i = 0; i < text.length; i++) {
    range.setStart(textNode, i);
    range.setEnd(textNode, i + 1);
    widths.push(range.getBoundingClientRect().width);
  }

  probe.remove();
  return widths;
}

// Between digits, Inter's contextual alternates lift a colon level with them,
// but a colon alone in its own box (a rolling digit's neighbor, or a part of
// a countdown laid out separately) has no digits beside it and drops to the
// baseline; no font feature raises it on its own. So it's set as "0:0",
// clipped to just the colon, which keeps the raised form. referenceEl gives
// the font to measure with.
function fillRaisedColon(box, referenceEl) {
  const [zeroWidth, colonWidth] = measureCharWidths(referenceEl, "0:0");
  box.textContent = "";
  const inContext = box.appendChild(document.createElement("span"));
  inContext.textContent = "0:0";
  inContext.style.cssText = `display:inline-block; white-space:pre; margin-left:${-zeroWidth}px;`;
  box.style.display = "inline-block";
  box.style.overflow = "hidden";
  box.style.width = `${colonWidth}px`;
}

// A roll still in progress, read off how far each strip has scrolled, so a new
// roll can continue from there instead of jumping. positions are fractional
// digits (5.3 is 30% of the way to 6). null when nothing is mid-roll.
function midRollState(element) {
  if (!numberAnimations.has(element)) return null;
  let text = "";
  const positions = [];
  const widths = [];
  const leaving = [];
  for (const child of element.children) {
    // Kept so it can finish shrinking instead of vanishing.
    if (child.dataset.rollLeaving) {
      const style = getComputedStyle(child);
      leaving.push({ text: child.textContent, width: parseFloat(style.width), opacity: parseFloat(style.opacity) });
      continue;
    }
    // A merged leading column ("8, 9, 10") stands for several characters:
    // read off as the whole number nearest where it is, split evenly.
    if (child.dataset.rollMerged) {
      const strip = child.firstElementChild;
      const slotHeight = parseFloat(child.style.height);
      const transform = getComputedStyle(strip).transform;
      const offsetY = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      const index = Math.round(Math.min(strip.children.length - 1, Math.max(0, -offsetY / slotHeight)));
      const part = strip.children[index].textContent;
      const width = parseFloat(getComputedStyle(child).width) / part.length;
      for (const digit of part) {
        text += digit;
        positions.push(null);
        widths.push(width);
      }
      continue;
    }
    widths.push(parseFloat(getComputedStyle(child).width));
    const strip = child.firstElementChild;
    if (!strip) {
      text += child.textContent;
      positions.push(null);
      continue;
    }
    const slotHeight = parseFloat(child.style.height);
    const transform = getComputedStyle(strip).transform;
    const offsetY = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    const index = Math.min(strip.children.length - 1, Math.max(0, -offsetY / slotHeight));
    // Strip entries count up by one, so the fraction between two entries is a
    // fraction of a digit.
    const position = (Number(strip.children[Math.floor(index)].textContent) + (index - Math.floor(index))) % 10;
    positions.push(position);
    text += String(Math.round(position) % 10);
  }
  return text ? { text, positions, widths, leaving } : null;
}

function animateNumberChange(element, newText, revealStyle) {
  if (element.dataset.rollValue === newText) return;

  // Picks up an interrupted roll from where its digits are rather than snapping
  // to its old target first.
  const midRoll = midRollState(element);
  const oldText = midRoll
    ? midRoll.text
    : element.dataset.rollValue !== undefined
      ? element.dataset.rollValue
      : element.textContent;

  // Otherwise a stale cleanup timer from an earlier roll could overwrite this
  // one's text later.
  clearTimeout(numberAnimations.get(element));
  numberAnimations.delete(element);
  element.style.display = "";
  element.style.alignItems = "";

  if (revealStyle === "instant") {
    element.dataset.rollValue = newText;
    element.textContent = newText;
    return;
  }

  // "--" is the big Domain grade's empty placeholder; "-" is every other
  // number's.
  if (revealStyle === "blur" && (oldText === "-" || oldText === "--")) {
    element.dataset.rollValue = newText;
    element.textContent = newText;
    // Blur alone reads flat; with the fade it's closer to a focus pull.
    element.style.filter = "blur(2px)";
    element.style.opacity = "0.4";
    void element.offsetWidth;  // so the starting state applies first
    element.style.transition = "filter 400ms ease-out, opacity 400ms ease-out";
    element.style.filter = "";
    element.style.opacity = "";
    return;
  }

  element.dataset.rollValue = newText;

  // Direction comes from the whole number, so 79 -> 86 spins every digit
  // forward even though 6 < 9.
  const oldValue = parseFloat(oldText);
  const newValue = parseFloat(newText);
  // A countdown only ticks down, so each digit drops in a single step, wraps
  // included, instead of spinning through the digits between.
  const countdown = revealStyle === "countdown";
  // A countdown ticks every second, so each roll has to finish well inside
  // one: the usual 800ms with a 60ms stagger per character left the last
  // digit of "00:33:21" landing after 1.2s, so every tick cut into the last
  // and the numbers moved in bursts every two seconds or so.
  const rollMs = countdown ? COUNTDOWN_ROLL_MS : ROLL_DURATION_MS;
  const staggerMs = countdown ? 0 : ROLL_STAGGER_MS;
  const overallGoingUp = !countdown && (isNaN(oldValue) || isNaN(newValue) || newValue >= oldValue);

  // The slot matches the finished line's real height, so the digits land
  // exactly where the plain text takes over; a rounded guess left them snapping
  // into place.
  let slotHeight = parseFloat(getComputedStyle(element).lineHeight);
  if (isNaN(slotHeight)) {
    const probe = document.createElement("span");
    probe.textContent = "0";
    probe.style.cssText = "display:block; line-height:normal;";
    element.textContent = "";
    element.appendChild(probe);
    slotHeight = probe.getBoundingClientRect().height;
  }

  element.textContent = "";
  element.style.display = "inline-flex";
  element.style.alignItems = "flex-end";

  const oldWidths = measureCharWidths(element, oldText);
  const newWidths = measureCharWidths(element, newText);

  // By place value, so gaining or losing a digit (99 -> 100) compares the right
  // pairs.
  const newDot = newText.indexOf(".");
  const oldDot = oldText.indexOf(".");
  const newIntLen = newDot === -1 ? newText.length : newDot;
  const oldIntLen = oldDot === -1 ? oldText.length : oldDot;

  function correspondingOldIndex(i) {
    if (i < newIntLen) {
      const distanceFromRight = newIntLen - 1 - i;
      return oldIntLen - 1 - distanceFromRight;
    }
    const decimalOffset = i - (newDot + 1);
    return oldDot === -1 ? -1 : oldDot + 1 + decimalOffset;
  }

  let maxDelay = 0;
  const continuing = Boolean(midRoll);

  // Lost leading digits shrink away rather than vanish on the first frame,
  // except when the new text is a dash placeholder, which simply replaces the
  // number.
  const toPlaceholder = !/[0-9]/.test(newText);
  const leavingDigits = continuing && !toPlaceholder ? midRoll.leaving.slice() : [];
  for (let oldIndex = 0; !toPlaceholder && oldIndex < oldIntLen - newIntLen; oldIndex++) {
    leavingDigits.push({
      text: oldText[oldIndex],
      width: continuing ? midRoll.widths[oldIndex] : oldWidths[oldIndex],
      opacity: 1,
    });
  }
  const leavingCurve = continuing ? "cubic-bezier(0.33, 1, 0.68, 1)" : "cubic-bezier(0.65, 0, 0.35, 1)";
  leavingDigits.forEach(({ text, width, opacity }) => {
    const leaving = document.createElement("span");
    leaving.dataset.rollLeaving = "true";
    leaving.style.cssText = `display:inline-block; overflow:hidden; height:${slotHeight}px; line-height:${slotHeight}px; width:${width}px; opacity:${opacity}; text-align:center; transition:none;`;
    leaving.textContent = text;
    // A colon on its way out (1:00:00 to 59:59) stays raised as it shrinks.
    if (text === ":") {
      fillRaisedColon(leaving, element);
      leaving.style.width = `${width}px`;
      leaving.style.textAlign = "left";
    }
    element.appendChild(leaving);
    void leaving.offsetWidth;  // so the starting width applies first
    leaving.style.transition = `width ${rollMs}ms ${leavingCurve}, opacity ${rollMs}ms ${leavingCurve}`;
    leaving.style.width = "0px";
    leaving.style.opacity = "0";
  });

  // Gaining a digit on the way up (87 -> 100): rather than a new column
  // appearing, the old leading digit's column counts on past 9 to the new
  // leading part, 8, 9, 10, widening to fit it, like an odometer's last
  // wheel. A continued roll keeps to separate columns.
  const gained = newIntLen - oldIntLen;
  const leadText = newText.slice(0, gained + 1);
  const mergeLead =
    !continuing && !countdown && overallGoingUp && gained > 0 && oldIntLen > 0 &&
    /[0-9]/.test(oldText[0]) && /^[0-9]+$/.test(leadText) && Number(leadText) > Number(oldText[0]);

  newText.split("").forEach((ch, i) => {
    if (mergeLead && i < gained) return;
    if (mergeLead && i === gained) {
      const from = Number(oldText[0]);
      const to = Number(leadText);
      const width = newWidths.slice(0, gained + 1).reduce((sum, w) => sum + w, 0);
      const easing = `${rollMs}ms cubic-bezier(0.65, 0, 0.35, 1) 0ms`;
      const slot = document.createElement("span");
      slot.dataset.rollMerged = "true";
      slot.style.cssText = `display:inline-block; overflow-x:visible; overflow-y:clip; height:${slotHeight}px; width:${oldWidths[0]}px; text-align:center; white-space:nowrap; transition:none;`;
      const strip = document.createElement("span");
      strip.style.cssText = "display:block; transition:none;";
      for (let n = from; n <= to; n++) {
        const digitEl = document.createElement("span");
        digitEl.style.cssText = `display:block; height:${slotHeight}px; line-height:${slotHeight}px;`;
        digitEl.textContent = String(n);
        strip.appendChild(digitEl);
      }
      strip.style.transform = "translateY(0px)";
      slot.appendChild(strip);
      element.appendChild(slot);
      void strip.offsetHeight;
      strip.style.transition = `transform ${easing}`;
      strip.style.transform = `translateY(${-(to - from) * slotHeight}px)`;
      slot.style.transition = `width ${easing}`;
      slot.style.width = `${width}px`;
      return;
    }
    // The same line box as a digit's slot, so a colon or dot sits at the
    // height it has in the plain text; sized to its own glyph, it rode up or
    // down against the digits and jumped back when the roll ended.
    if (!/[0-9]/.test(ch)) {
      const staticEl = document.createElement("span");
      staticEl.style.cssText = `display:inline-block; width:${newWidths[i]}px; height:${slotHeight}px; line-height:${slotHeight}px; text-align:center;`;
      if (ch === ":") {
        fillRaisedColon(staticEl, element);
        staticEl.style.textAlign = "left";
      } else {
        staticEl.textContent = ch;
      }
      element.appendChild(staticEl);
      return;
    }

    const finalDigit = Number(ch);
    const newWidth = newWidths[i];
    const oldIndex = correspondingOldIndex(i);
    const oldChar = oldIndex >= 0 && oldIndex < oldText.length ? oldText[oldIndex] : undefined;
    const hasOldDigit = /[0-9]/.test(oldChar);

    // A continued roll is already moving, so it starts fast with no stagger and
    // reads as one motion.
    const delay = continuing ? 0 : i * staggerMs;
    maxDelay = Math.max(maxDelay, delay);
    const curve = continuing ? "cubic-bezier(0.33, 1, 0.68, 1)" : "cubic-bezier(0.65, 0, 0.35, 1)";
    const easing = `${rollMs}ms ${curve} ${delay}ms`;

    // No old digit at this place (the new "1" of 99 -> 100) rolls up from 0.
    const midPosition = continuing && oldIndex >= 0 ? midRoll.positions[oldIndex] : null;
    const startPosition = midPosition !== null && midPosition !== undefined ? midPosition : hasOldDigit ? Number(oldChar) : 0;
    const startWhole = Math.floor(startPosition);
    const startFraction = startPosition - startWhole;

    const goingUp = hasOldDigit ? overallGoingUp : true;
    // A start partway past the final digit has to wrap all the way round.
    const top = startWhole + (startFraction > 0 ? 1 : 0);
    let steps = goingUp ? finalDigit - startWhole : top - finalDigit;
    steps = ((steps % 10) + 10) % 10;
    if (steps === 0 && startFraction > 0) steps = 10;
    const oneStep = countdown && hasOldDigit && steps > 1;
    if (oneStep) steps = 1;
    const stripLength = steps + 1;
    const startIndex = oneStep ? 1 : goingUp ? startFraction : steps - (top - startPosition);
    // Digits differ in width, so the slot eases to the new width instead of
    // jumping.
    const midWidth = continuing && oldIndex >= 0 ? midRoll.widths[oldIndex] : undefined;
    const startWidth = midWidth !== undefined ? midWidth : hasOldDigit ? oldWidths[oldIndex] : 0;
    const slot = document.createElement("span");
    // Clipped only above and below: a glyph can reach past its own width (the
    // top of a 7), which a side clip cut off.
    slot.style.cssText = `display:inline-block; overflow-x:visible; overflow-y:clip; height:${slotHeight}px; width:${startWidth}px; text-align:center; transition:none;`;

    const strip = document.createElement("span");
    strip.style.cssText = "display:block; transition:none;";

    const base = goingUp ? startWhole : finalDigit;
    for (let d = 0; d < stripLength; d++) {
      const digitEl = document.createElement("span");
      digitEl.style.cssText = `display:block; height:${slotHeight}px; line-height:${slotHeight}px;`;
      digitEl.textContent = oneStep ? String(d === 0 ? finalDigit : startWhole) : String((base + d) % 10);
      strip.appendChild(digitEl);
    }

    const maxOffset = (stripLength - 1) * slotHeight;
    const startTransform = -startIndex * slotHeight;
    const endTransform = goingUp ? -maxOffset : 0;
    strip.style.transform = `translateY(${startTransform}px)`;

    slot.appendChild(strip);
    element.appendChild(slot);

    // So the starting frame applies before the transition.
    void strip.offsetHeight;
    strip.style.transition = `transform ${easing}`;
    strip.style.transform = `translateY(${endTransform}px)`;
    slot.style.transition = `width ${easing}`;
    slot.style.width = `${newWidth}px`;
  });

  const timer = setTimeout(() => {
    element.textContent = newText;
    element.style.display = "";
    element.style.alignItems = "";
    numberAnimations.delete(element);
  }, rollMs + maxDelay + 50);

  numberAnimations.set(element, timer);
}

// Everything about the user lives here and in Firestore; localStorage only
// caches it per user for faster page loads. Signed out, edits stay in memory
// and are lost on navigation.
let appData = emptyAppData();

function loadPeriods() {
  return appData.periods;
}

function loadPeriodDivisions() {
  // Older cached data may not have this field.
  return appData.periodDivisions || [];
}

function loadHiddenCourses() {
  return appData.hiddenCourses || [];
}

function saveHiddenCourses(names) {
  appData.hiddenCourses = names;
  pushDataToCloud();
}

function loadAddedAssessments() {
  return appData.addedAssessments || [];
}

function saveAddedAssessments(entries) {
  appData.addedAssessments = entries;
  pushDataToCloud();
}

function loadCompletedTasks() {
  return appData.completedTasks || [];
}

function saveCompletedTasks(ids) {
  appData.completedTasks = ids;
  pushDataToCloud();
}

// Firestore is the source of truth; the local cache only spares each page load
// a network round trip.

let currentUid = null;

function cacheKeyFor(uid) {
  return `cachedAppData_${uid}`;
}

function readCachedAppData(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKeyFor(uid)));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedAppData(uid, data) {
  try {
    localStorage.setItem(cacheKeyFor(uid), JSON.stringify(data));
  } catch {
    // The cache is optional.
  }
}

// Keeps only the current user's cache on this device.
function clearOtherCachedAppData(uid) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith("cachedAppData_") && key !== cacheKeyFor(uid)) {
      localStorage.removeItem(key);
    }
  }
}

// Readable synchronously, unlike Firebase's auth state, so it's used as a first
// guess for instant rendering.
const LAST_UID_KEY = "lastKnownUid";

function readLastKnownUid() {
  return localStorage.getItem(LAST_UID_KEY);
}

function writeLastKnownUid(uid) {
  try {
    localStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    // Storage is optional.
  }
}

function clearLastKnownUid() {
  localStorage.removeItem(LAST_UID_KEY);
}

let sharedToastEl = null;
let sharedToastHideTimer = null;
const SHARED_TOAST_VISIBLE_MS = 4000;

// message can be a node when the toast needs a link.
function showToast(message) {
  if (!sharedToastEl) {
    sharedToastEl = document.createElement("div");
    sharedToastEl.className = "signin-toast";
    document.body.appendChild(sharedToastEl);
    void sharedToastEl.offsetWidth;  // so the entrance transitions
  }

  sharedToastEl.replaceChildren(message);
  sharedToastEl.classList.add("signin-toast--visible");
  clearTimeout(sharedToastHideTimer);
  sharedToastHideTimer = setTimeout(() => {
    sharedToastEl.classList.remove("signin-toast--visible");
  }, SHARED_TOAST_VISIBLE_MS);
}

function hideToast() {
  if (!sharedToastEl) return;
  clearTimeout(sharedToastHideTimer);
  sharedToastEl.classList.remove("signin-toast--visible");
}

// Like Chrome's own title tooltip, but see-through and quicker. It stays put
// while the mouse moves and jumps once it rests again, as the native one does.
const HOVER_TOOLTIP_DELAY_MS = 400;
const HOVER_TOOLTIP_EDGE_GAP = 8;
let hoverTooltipEl = null;
let hoverTooltipTimer = null;

function hideHoverTooltip() {
  clearTimeout(hoverTooltipTimer);
  if (hoverTooltipEl) hoverTooltipEl.classList.remove("hover-tooltip--visible");
}

// At a fractional edge the 1px rim renders softer on that side.
function sizeHoverTooltip(tooltip) {
  tooltip.style.width = "";
  tooltip.style.width = `${Math.ceil(tooltip.getBoundingClientRect().width)}px`;
}

function placeHoverTooltip(tooltip, x, y) {
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.min(Math.round(x), window.innerWidth - width - HOVER_TOOLTIP_EDGE_GAP);
  const below = Math.round(y) + 18;
  const top = below + height > window.innerHeight - HOVER_TOOLTIP_EDGE_GAP ? Math.round(y) - 8 - height : below;
  tooltip.style.left = `${Math.max(HOVER_TOOLTIP_EDGE_GAP, left)}px`;
  tooltip.style.top = `${Math.max(HOVER_TOOLTIP_EDGE_GAP, top)}px`;
}

// For modes that take over the page (like the Calendar's date picking), where
// the hover tooltip is suppressed. Returns a remover.
function showCursorTooltip(text, x, y) {
  const tooltip = document.createElement("div");
  tooltip.className = "hover-tooltip";
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  sizeHoverTooltip(tooltip);
  placeHoverTooltip(tooltip, x, y);
  const follow = (event) => placeHoverTooltip(tooltip, event.clientX, event.clientY);
  document.addEventListener("mousemove", follow);
  void tooltip.offsetWidth;  // so the fade-in plays
  tooltip.classList.add("hover-tooltip--visible");
  return () => {
    document.removeEventListener("mousemove", follow);
    tooltip.classList.remove("hover-tooltip--visible");
    setTimeout(() => tooltip.remove(), 150);
  };
}

// options.when lets a nested element's own tooltip (a pill inside its day) win
// over this one. text can be a function, for a tooltip that changes with state.
function attachHoverTooltip(element, text, options = {}) {
  const currentText = () => (typeof text === "function" ? text() : text);
  let cursor = null;
  const showSoon = (event) => {
    if (options.when && !options.when(event)) {
      cursor = null;
      // Without touching a timer the nested element may have just started.
      if (hoverTooltipEl && hoverTooltipEl.textContent === currentText()) {
        hoverTooltipEl.classList.remove("hover-tooltip--visible");
      }
      return;
    }
    // Ignores the jitter of a hand resting on a trackpad.
    if (cursor && Math.hypot(event.clientX - cursor.x, event.clientY - cursor.y) < 2) return;
    cursor = { x: event.clientX, y: event.clientY };
    clearTimeout(hoverTooltipTimer);
    hoverTooltipTimer = setTimeout(() => {
      if (document.documentElement.dataset.suppressTooltips) return;
      // Things may have changed during the delay, like the click that opened
      // a popup.
      if (options.when && !options.when(event)) return;
      if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
      }
      hoverTooltipEl.textContent = currentText();
      sizeHoverTooltip(hoverTooltipEl);
      placeHoverTooltip(hoverTooltipEl, cursor.x, cursor.y);
      hoverTooltipEl.classList.add("hover-tooltip--visible");
    }, HOVER_TOOLTIP_DELAY_MS);
  };
  element.addEventListener("mouseenter", showSoon);
  element.addEventListener("mousemove", showSoon);
  // A click dismisses it, like the native one, so it doesn't hover over
  // whatever the click opens.
  element.addEventListener("mousedown", hideHoverTooltip);
  element.addEventListener("mouseleave", () => {
    cursor = null;
    hideHoverTooltip();
  });
}

// Every save funnels through here, so this is where signed-out users are told
// nothing is being saved.
function showSignInToast() {
  showToast("Sign in to save your data!");
}

// Saves from this tab still on their way (encrypting, then writing), during
// which a snapshot of the cloud copy is older than this tab's own data (see
// watchUserDocForChanges in boot.js).
let cloudWritesInFlight = 0;

function pushDataToCloud() {
  if (!currentUid) {
    showSignInToast();
    return;
  }
  // Lets a read that races this write tell its data is newer.
  appData.lastModified = Date.now();
  // Encryption hides data from Firestore, not from this device.
  writeCachedAppData(currentUid, appData);

  if (typeof firebase === "undefined" || !firebase.firestore) return;

  const uid = currentUid;
  // Safe as a shallow copy: the encrypted fields are always replaced wholesale,
  // never mutated. Preferences are left out: they save themselves (see
  // setPreference), and this tab's copy in appData isn't kept up to date, so
  // writing it put back whatever they were when the page loaded. Merged, so
  // they're kept rather than dropped; every field written is replaced whole.
  const { preferences, ...snapshot } = appData;
  cloudWritesInFlight++;
  getDeviceKey(uid)
    .then((key) => encryptAppDataForCloud(snapshot, key))
    .then((encrypted) => firebase.firestore().collection("users").doc(uid).set(encrypted, { merge: true }))
    .catch((error) => console.error("Failed to save to Firestore:", error))
    .finally(() => cloudWritesInFlight--);
}


function resetAppData() {
  appData = emptyAppData();
}

// Only the current page's init function exists as a global.
function initPage() {
  if (typeof initMyCoursesPage === "function") initMyCoursesPage();
  if (typeof initDomainPage === "function") initDomainPage();
  if (typeof initGpaPage === "function") initGpaPage();
  if (typeof initClassCountdown === "function") initClassCountdown();
}

// Running twice would duplicate cards and listeners, so a sign-in or out after
// init reloads instead.
let hasInitializedPage = false;

function handleAuthResolved() {
  if (hasInitializedPage) {
    console.log("[boot] handleAuthResolved: already rendered — reloading", { appData });
    location.reload();
    return;
  }
  console.log("[boot] handleAuthResolved: rendering for the first time", { appData });
  hasInitializedPage = true;
  initPage();
}
