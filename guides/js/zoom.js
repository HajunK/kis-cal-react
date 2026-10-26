// The zoom control (50% to 250%) that every guide page shows, in the top-right
// corner. It sets --zoom on the page: a guide's text scales through the
// .zoomable class in guides.css, and a page that lays out its own pictures
// (like /biology) reads --zoom itself. Double-click the slider to go back to
// 100%. Loaded by guide.html and by pages of their own.
//
// The thumb follows the pointer smoothly (the input's step is fine), but the
// zoom itself, and the number beside it, are always the nearest 5%. Let go
// between two and the thumb glides to the 5% it stands for.
const STEP = 5;
const SETTLE_MS = 160;

const label = document.createElement("label");
label.className = "zoom";
label.innerHTML = `
  Zoom
  <input type="range" min="50" max="250" step="0.1" value="100" aria-label="Zoom" />
  <output>100%</output>`;
const slider = label.querySelector("input");
const output = label.querySelector("output");
const min = Number(slider.min);
const max = Number(slider.max);

const snap = (value) => Math.min(max, Math.max(min, Math.round(value / STEP) * STEP));

// Shows where the thumb is (the blue fill behind it) and applies the zoom of
// the nearest 5% to it.
const apply = () => {
  const shown = Number(slider.value);
  const zoom = snap(shown);
  document.documentElement.style.setProperty("--zoom", String(zoom / 100));
  slider.style.setProperty("--fill", `${((shown - min) / (max - min)) * 100}%`);
  slider.setAttribute("aria-valuetext", `${zoom}%`);
  output.textContent = `${zoom}%`;
};

let settling = 0; // the frame request of a glide in progress
const stopSettling = () => {
  cancelAnimationFrame(settling);
  settling = 0;
};

// Moves the thumb from where it is to the 5% it stands for.
const settle = () => {
  stopSettling();
  const from = Number(slider.value);
  const to = snap(from);
  if (from === to) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    slider.value = String(to);
    apply();
    return;
  }
  const start = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - start) / SETTLE_MS);
    const eased = 1 - (1 - progress) ** 3;
    slider.value = String(from + (to - from) * eased);
    apply();
    settling = progress < 1 ? requestAnimationFrame(frame) : 0;
  };
  settling = requestAnimationFrame(frame);
};

slider.addEventListener("pointerdown", stopSettling);
slider.addEventListener("input", apply);
// Fires when the thumb is let go (and after a keyboard change).
slider.addEventListener("change", settle);
// The arrow keys, Page Up/Down, Home and End move by whole 5%s, not the fine step.
slider.addEventListener("keydown", (event) => {
  const moves = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP, PageDown: -STEP * 4, PageUp: STEP * 4 };
  let target;
  if (event.key in moves) target = snap(Number(slider.value)) + moves[event.key];
  else if (event.key === "Home") target = min;
  else if (event.key === "End") target = max;
  else return;
  event.preventDefault();
  stopSettling();
  slider.value = String(Math.min(max, Math.max(min, target)));
  apply();
});
slider.addEventListener("dblclick", () => {
  stopSettling();
  slider.value = "100";
  apply();
});

document.body.appendChild(label);
apply();

// The page's scrollbar takes room on the right; the same room is kept on the
// left (guides.css), so the page stays centered in the window. --view is the
// width left for the page between the two.
const measure = () => {
  const root = document.documentElement;
  const scrollbar = window.innerWidth - root.clientWidth;
  root.style.setProperty("--scrollbar", `${scrollbar}px`);
  root.style.setProperty("--view", `${root.clientWidth - scrollbar}px`);
};
measure();
window.addEventListener("resize", measure);
