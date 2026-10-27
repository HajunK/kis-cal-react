// The card a clicked calendar pill opens, in the manner of Apple Calendar's event
// popover: the pill takes its course's color (its text black or white by that
// color's lightness, as a checked-off item's check is; see calendar.css) and a glass
// card below it gives the details, with Delete at the bottom. One at a time; it closes on a click anywhere else, Escape, a scroll or a
// resize.
import { closeOtherPopups } from "../shell/ui.js";

const TIP_RADIUS = 3; // the circle that rounds off the point's tip
const MIN_CARD_WIDTH = 256; // as narrow as the card goes: its two buttons still fit side by side, equal

// The outline of the card as one shape: a rounded rectangle (w by h, corners of radius r) with, when
// `point` is given, a point out of one side ({ side: "left" | "right", y, depth, half }): y
// where its tip is along that side, depth how far it sticks out, half half its width at the
// card's edge. Drawn from (offset, 0), so the point's room outside the card isn't cut off.
// Every part of the card, point included, is drawn from this one path (the glass, its
// edge and its shadow), so the point is part of the card, not stuck on. The corners are
// plain circular arcs (not a squircle's flatter curve), and so is the point's tip, rounded
// off with a small circle that touches both of its sides.
export function cardShapePath(w, h, r, point = null, offset = 0) {
  const n = (value) => Math.round((value + offset) * 100) / 100;
  const m = (value) => Math.round(value * 100) / 100;
  const onRight = point && point.side === "right";
  const onLeft = point && point.side === "left";
  const { y, depth, half } = point || {};
  // The circle rounding the tip, of radius TIP_RADIUS, sits against both sides of the point:
  // those sides meet the arc where they're a distance dx back from the sharp tip along the
  // card's axis and dy either side of it.
  const length = point ? Math.hypot(depth, half) : 1;
  const dx = point ? (TIP_RADIUS * depth * depth) / (half * length) : 0;
  const dy = point ? (TIP_RADIUS * depth) / length : 0;
  const arc = (radius, x, yy) => `A ${radius} ${radius} 0 0 1 ${x} ${yy}`;
  return [
    `M ${n(r)} 0`,
    `L ${n(w - r)} 0`,
    arc(r, n(w), r),
    // Down the right edge, out round the point if it's on this side.
    ...(onRight
      ? [
          `L ${n(w)} ${m(y - half)}`,
          `L ${n(w + depth - dx)} ${m(y - dy)}`,
          arc(TIP_RADIUS, n(w + depth - dx), m(y + dy)),
          `L ${n(w)} ${m(y + half)}`,
        ]
      : []),
    `L ${n(w)} ${h - r}`,
    arc(r, n(w - r), h),
    `L ${n(r)} ${h}`,
    arc(r, n(0), h - r),
    // Up the left edge, out round the point if it's on this side.
    ...(onLeft
      ? [
          `L ${n(0)} ${m(y + half)}`,
          `L ${n(-depth + dx)} ${m(y + dy)}`,
          arc(TIP_RADIUS, n(-depth + dx), m(y - dy)),
          `L ${n(0)} ${m(y - half)}`,
        ]
      : []),
    `L ${n(0)} ${r}`,
    arc(r, n(r), 0),
    "Z",
  ].join(" ");
}

// The part of the window that's actually on screen, in the coordinates a fixed card is placed
// in: all of it normally, but a pinch-zoomed page shows only a part of it, and a card put
// beside a pill by the window's size would land outside what's visible.
export function visibleArea() {
  const view = window.visualViewport;
  if (!view) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  return { left: view.offsetLeft, top: view.offsetTop, right: view.offsetLeft + view.width, bottom: view.offsetTop + view.height };
}

// Which side of the pill the card goes, and how wide it is there. tipLeft and tipRight are
// where its point would end on each side; depth is how far the point sticks out; width is
// the card's usual width. To the right when it fits there, else to the left, else, with
// neither wide enough, narrowed to the side with more room (down to minWidth); null when
// there isn't room beside the pill at all.
export function sideFor({ area, tipLeft, tipRight, depth, width, margin = 8, minWidth = MIN_CARD_WIDTH }) {
  const spaceRight = area.right - margin - (tipRight + depth);
  const spaceLeft = tipLeft - depth - (area.left + margin);
  if (spaceRight >= width) return { side: "right", width };
  if (spaceLeft >= width) return { side: "left", width };
  const widest = Math.max(spaceRight, spaceLeft);
  if (widest < minWidth) return null;
  return { side: spaceRight >= spaceLeft ? "right" : "left", width: Math.floor(widest) };
}

const CARD_MS = 200; // how long the card takes to open or close (--pill-card-ms in calendar.css)

let selected = null; // { pill, menu, cleanup }
let shapeCount = 0;

export function closePillMenu() {
  if (!selected) return;
  const { pill, menu, cleanup } = selected;
  selected = null;
  cleanup();
  pill.classList.remove("assessment-chip--selected");
  menu.classList.remove("popup-menu--visible");
  // Shrinking back into its point for as long as it took to open (calendar.css), and not
  // clickable meanwhile.
  menu.style.pointerEvents = "none";
  setTimeout(() => menu.remove(), CARD_MS);
}

export function selectedPill() {
  return selected ? selected.pill : null;
}

const POINT_DEPTH = 10;
const POINT_HALF = 11;
const CARD_RADIUS = 18;

// pill: the clicked pill. details: { title, subtitle, rows, done } (see pillDetails
// in model.js). onDelete runs when "Delete" is chosen. onReschedule(event), given
// only for what the student added, adds Reschedule beside Delete. deleteLabel
// words that button ("Delete" unless the pill isn't the student's own), and deleteIcon
// ("trash" or "flag", from icons/) draws its icon.
export function openPillMenu(pill, { details, onDelete, onReschedule, deleteLabel = "Delete", deleteIcon = "trash" }) {
  closePillMenu();
  // Nothing else stays open beside it: the Add menu and popup, the account menu, a
  // color picker, the schedule.
  closeOtherPopups();

  const chipColor = getComputedStyle(pill).getPropertyValue("--chip-color") || "var(--color-dark-blue)";
  pill.classList.add("assessment-chip--selected");

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  // popup-menu--types: the flat edge the Calendar's menus and Add popup have, not the
  // gradient ring other menus get (see floating.css).
  const menu = element("div", "popup-menu popup-menu--types calendar-glass pill-menu pill-details");
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", details.title);
  menu.style.setProperty("--chip-color", chipColor);

  // The course's color down the left of the title, as the event's calendar color
  // is in Apple Calendar.
  const header = menu.appendChild(element("div", "pill-details-header"));
  header.appendChild(element("span", "pill-details-bar"));
  const heading = header.appendChild(element("div", "pill-details-heading"));
  heading.appendChild(element("span", "pill-details-title", details.title));
  if (details.subtitle) heading.appendChild(element("span", "pill-details-subtitle", details.subtitle));
  if (details.done) header.appendChild(element("span", "pill-details-done", "Done"));

  const list = menu.appendChild(element("dl", "pill-details-rows"));
  details.rows.forEach(([label, value]) => {
    const row = list.appendChild(element("div", "pill-details-row"));
    row.appendChild(element("dt", "", label));
    row.appendChild(element("dd", "", value));
  });

  const actions = menu.appendChild(element("div", "pill-details-actions"));
  if (onReschedule) {
    const reschedule = actions.appendChild(element("button", "pill-details-reschedule", "Reschedule"));
    reschedule.type = "button";
    reschedule.addEventListener("click", (event) => {
      closePillMenu();
      onReschedule(event);
    });
  }
  const remove = actions.appendChild(element("button", "pill-details-delete"));
  remove.type = "button";
  remove.appendChild(element("span", `pill-details-icon pill-details-icon--${deleteIcon}`)).setAttribute("aria-hidden", "true");
  remove.appendChild(element("span", "", deleteLabel));
  remove.addEventListener("click", () => {
    closePillMenu();
    onDelete();
  });
  document.body.appendChild(menu);

  // Beside the pill, as Apple Calendar's popover is: to its right with a point at its
  // left edge, or to its left with the point on the right when there's no room, level
  // with the pill as far as the window allows. Under it when there's no room beside.
  // Room is judged by what's on screen (see visibleArea), so it still goes to the left
  // when the page is zoomed in and the right is out of view.
  const rect = pill.getBoundingClientRect();
  const area = visibleArea();
  let width = menu.offsetWidth;
  let height = menu.offsetHeight;
  // The point's tip stops just past the gridline at the edge of the pill's day, clear of
  // it, rather than reaching onto it (or a little past the pill, outside a day).
  const cell = pill.closest(".assessment-week-day, .class-grid-cell");
  const box = cell ? cell.getBoundingClientRect() : null;
  const TIP_CLEAR = 5; // past the day's edge: its 1px gridline, then a gap
  const tipRight = box ? Math.max(rect.right + 2, box.right + TIP_CLEAR) : rect.right + 2;
  const tipLeft = box ? Math.min(rect.left - 2, box.left - TIP_CLEAR) : rect.left - 2;
  let point = null; // the card's point toward the pill, when it's beside it
  const beside = sideFor({ area, tipLeft, tipRight, depth: POINT_DEPTH, width });
  if (beside) {
    const side = beside.side;
    // Narrower than usual when that's the room there is (the page zoomed in a long way).
    if (beside.width !== width) {
      menu.style.width = `${beside.width}px`;
      width = menu.offsetWidth;
      height = menu.offsetHeight;
    }
    const left = side === "right" ? tipRight + POINT_DEPTH : tipLeft - POINT_DEPTH - width;
    const centre = rect.top + rect.height / 2;
    const top = Math.max(area.top + 8, Math.min(centre - height / 2, area.bottom - height - 8));
    // Where the point sits on the card's edge: at the pill, but clear of the corners.
    const pointY = Math.max(26, Math.min(centre - top, height - 26));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    // The card grows out of its point: it scales about the tip, which stays where it is.
    const tipX = side === "right" ? -POINT_DEPTH + 1 : width + POINT_DEPTH - 1;
    menu.style.transformOrigin = `${tipX}px ${pointY}px`;
    point = { side: side === "right" ? "left" : "right", y: pointY, depth: POINT_DEPTH, half: POINT_HALF };
  } else {
    const left = Math.max(area.left + 8, Math.min(rect.left, area.right - width - 8));
    const below = rect.bottom + 6;
    const top = below + height > area.bottom - 8 ? rect.top - 6 - height : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.transformOrigin = `${Math.max(0, rect.left + rect.width / 2 - left)}px ${top < rect.top ? "100%" : "0"}`;
  }
  // The card's look, drawn from one outline (see cardShapePath) so its point is part of it:
  // a shadow behind, the glass, and its edge over the glass, all under the content.
  const room = POINT_DEPTH + 6; // outside the card's own box, for the point and the shadow
  const outline = cardShapePath(width, height, CARD_RADIUS, point, room);
  const layer = (name) => {
    const node = element("div", `pill-details-layer pill-details-layer--${name}`);
    node.style.left = `${-room}px`;
    node.style.top = `0px`;
    node.style.width = `${width + room * 2}px`;
    node.style.height = `${height}px`;
    node.setAttribute("aria-hidden", "true");
    return node;
  };
  // Ids unique to this card: one fading out can still be on the page as the next opens.
  const uid = `pd${++shapeCount}`;
  const svg = (inner) => `<svg width="${width + room * 2}" height="${height}" viewBox="0 0 ${width + room * 2} ${height}" overflow="visible">${inner}</svg>`;
  const shadow = layer("shadow");
  // The shadow is the outline blurred and dropped a little, with the card's own shape cut
  // out of it (after the blur), so it never darkens the glass.
  shadow.innerHTML = svg(
    `<defs><filter id="${uid}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>` +
      `<mask id="${uid}m" maskUnits="userSpaceOnUse" x="-100" y="-100" width="${width + room * 2 + 200}" height="${height + 200}">` +
      `<rect x="-100" y="-100" width="${width + room * 2 + 200}" height="${height + 200}" fill="#fff" /><path d="${outline}" fill="#000" /></mask></defs>` +
      `<g mask="url(#${uid}m)"><path d="${outline}" class="pill-details-shadow-shape" transform="translate(0 4)" filter="url(#${uid}b)" /></g>`
  );
  const glass = layer("glass");
  glass.style.clipPath = `path("${outline}")`;
  // A flat tone over the glass, the same colour the panels its text used to sit on had, so
  // the whole card is that colour and the text sits straight on it.
  const tone = layer("tone");
  tone.style.clipPath = `path("${outline}")`;
  const edge = layer("edge");
  // The line round the card is lighter at the top left than along its right and bottom
  // (--detail-edge-start and -end, in calendar.css): a gradient across the card on its
  // diagonal, from its top left corner to its bottom right.
  const reach = (width + height) / 4;
  const centreX = room + width / 2;
  const centreY = height / 2;
  const gradient =
    `<linearGradient id="${uid}g" gradientUnits="userSpaceOnUse" x1="${centreX - reach}" y1="${centreY - reach}" x2="${centreX + reach}" y2="${centreY + reach}">` +
    `<stop offset="0" style="stop-color: var(--detail-edge-start)" /><stop offset="1" style="stop-color: var(--detail-edge-end)" /></linearGradient>`;
  edge.innerHTML = svg(
    `<defs><clipPath id="${uid}c"><path d="${outline}" /></clipPath>${gradient}</defs>` +
      `<path d="${outline}" class="pill-details-edge-rim" clip-path="url(#${uid}c)" />` +
      `<path d="${outline}" class="pill-details-edge-line" stroke="url(#${uid}g)" />`
  );
  menu.prepend(shadow, glass, tone, edge);

  void menu.offsetWidth;  // so the entrance transitions
  menu.classList.add("popup-menu--visible");

  // Other pills choose for themselves (they close this one and open their own, or
  // close it again when it's their own pill).
  const onPointerDown = (event) => {
    if (menu.contains(event.target) || event.target.closest(".assessment-chip")) return;
    closePillMenu();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closePillMenu();
  };
  const onMove = () => closePillMenu();
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onMove);
  document.addEventListener("scroll", onMove, true);
  selected = {
    pill,
    menu,
    cleanup: () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    },
  };
}
