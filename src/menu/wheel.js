// The Menu tab's day change: the days are flat panels carried over a wheel, like paper over a
// roller. In front of the wheel a panel is flat; where it goes round the wheel's edge it
// follows the curve, so only the part that's gone round is bent, and bent the same way
// whatever the time, as one rigid sheet would be. At rest it's flat (the page as it is), and
// it bends as it's carried to the side and straightens as it's carried to the front.
// CSS can't bend a box, so each panel is cut into thin upright strips (copies of it, each
// showing its own slice), and every frame sets each strip on the belt: flat in front, turned
// to face outward and moved back where it's round the wheel. The whole thing also pulls back a
// little as it starts and comes forward as it stops, so the panels are lifted onto the wheel
// rather than bent where they stand.

// The wheel's settings. They can be changed while it runs (the Menu page's ?tune panel does, to
// try them out; see WheelTuner.jsx): all but the settling time, which is read as a turn begins.
export const wheelTuning = {
  // How long the wheel takes to settle on a day, about, in ms (it's a critically damped spring,
  // which never overshoots and carries on from whatever it was doing when it's aimed elsewhere).
  settleMs: 900,
  // How much the turn eases out, 0 to 1: 1 is the spring above (fast start, long ease-out), 0
  // is a steady speed that stops at the day, and between is a mix of the two.
  easeOut: 1,
  // The wheel's radius when a panel is round it, in px.
  radius: 800,
  // How fast the flat part of the belt shrinks as a panel is carried off, in px per px carried:
  // 0 bends a panel only once it's carried past its own edges, higher bends it sooner and more.
  bendRate: 1,
  // How far the whole belt pulls back at its most (px of depth; about 7% smaller at 170).
  pullBack: 170,
};
export const WHEEL_DEFAULTS = { ...wheelTuning };
// What the page takes as the length of a turn, for its title's fade.
export const WHEEL_MS = wheelTuning.settleMs;
const STRIP_PX = 20;
const WHEEL_PERSPECTIVE = 2200;
// Room kept round a panel for its shadow, in px.
const SHADOW_ROOM = 28;
// How far apart the panels are on the belt, past their own width.
const PANEL_GAP = 60;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (from, to, x) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A panel as strips: source is cloned into each, shifted so the strip shows its own slice.
// set(travel, pull, opacity): travel is how far along the belt the panel's middle is from the
// front (px), pull how far the belt is pulled back (px of depth).
function stripsOf(source, box) {
  const count = Math.ceil(box.width / STRIP_PX);
  const pitch = box.width / count;
  // Room round the panel for its shadow, so that's cut into strips and wrapped with it: some
  // strips beyond each edge, and the strips taller than the panel.
  const extra = Math.ceil(SHADOW_ROOM / pitch);
  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    pointerEvents: "none",
    transformStyle: "preserve-3d",
  });
  const strips = Array.from({ length: count + 2 * extra }, (_, n) => {
    const i = n - extra;
    const strip = document.createElement("div");
    // A pixel wider than its pitch, so no seam shows between neighbours.
    Object.assign(strip.style, {
      position: "absolute",
      top: `${-SHADOW_ROOM}px`,
      left: `${i * pitch}px`,
      width: `${pitch + 1}px`,
      height: `${box.height + 2 * SHADOW_ROOM}px`,
      overflow: "hidden",
      // A strip carried round to the far side of the wheel isn't shown from behind.
      backfaceVisibility: "hidden",
      willChange: "transform, opacity",
    });
    const copy = source.cloneNode(true);
    // A ripple caught part way (see MenuPage's ripple) is copied without its animation, as a
    // solid circle: the copies don't have it.
    copy.querySelectorAll(".menu-card-ripple").forEach((wave) => wave.remove());
    copy.removeAttribute("role");
    copy.removeAttribute("aria-label");
    Object.assign(copy.style, {
      position: "absolute",
      top: `${SHADOW_ROOM}px`,
      left: `${-i * pitch}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: "0",
      visibility: "visible",
    });
    strip.appendChild(copy);
    overlay.appendChild(strip);
    // This strip's middle, from the panel's, when it's flat.
    return { strip, offset: (i + 0.5) * pitch - box.width / 2 };
  });
  return {
    overlay,
    set(travel, pull, opacity) {
      // Where the flat part of the belt ends: at the panel's own edges (and the room for its
      // shadow) at rest, and nearer the middle the further it's carried, so the bend starts as
      // soon as it starts to move, not once it's been carried a panel's width, and each part of
      // it that's carried out takes the curve of the wheel the same way.
      const flat = Math.max(0, box.width / 2 + extra * pitch - wheelTuning.bendRate * Math.abs(travel));
      strips.forEach(({ strip, offset }) => {
        // This strip's place along the belt from the front's middle.
        const along = offset + travel;
        const past = Math.abs(along) - flat;
        const side = Math.sign(along);
        let x = along;
        let z = 0;
        let angle = 0;
        if (past > 0) {
          const turned = past / wheelTuning.radius;
          x = side * (flat + wheelTuning.radius * Math.sin(turned));
          z = wheelTuning.radius * (Math.cos(turned) - 1);
          angle = side * turned;
        }
        strip.style.transform = `translate3d(${x - offset}px, 0, ${z - pull}px) rotateY(${angle}rad)`;
        strip.style.opacity = String(opacity);
      });
    },
  };
}

// A wheel standing in front of the cards while the day changes. The day at the front is
// step 0 when it's made, and the wheel is aimed at a step (goTo): a panel for each day it
// passes is made as it comes into view (contentAt(step) gives the element to cut into strips,
// or null where there's no day) and put away as it leaves. It's the position of the wheel,
// a number of steps, that moves, as a spring toward the step it's aimed at: aiming it again
// while it moves, either way, just changes where it's headed; it doesn't start over.
// The real cards stay hidden until it has settled (onSettled), by which time they show the day
// it settled on. Returns { goTo(step), end() }.
export function createWheel({ stage, cards, box, contentAt, onSettled }) {
  const SPRING = 5.8 / (wheelTuning.settleMs / 1000);
  const distance = box.width + PANEL_GAP;
  const panels = new Map(); // step -> { overlay, set }
  const previous = { perspective: stage.style.perspective, visibility: cards.style.visibility };
  stage.style.perspective = `${WHEEL_PERSPECTIVE}px`;
  cards.style.visibility = "hidden";

  let position = 0;
  let velocity = 0;
  let target = 0;
  let pull = 0;
  let frame = 0;
  let last = 0;
  let done = false;

  const panelAt = (step) => {
    if (panels.has(step)) return panels.get(step);
    const source = contentAt(step);
    if (!source) {
      panels.set(step, null);
      return null;
    }
    const panel = stripsOf(source, box);
    stage.appendChild(panel.overlay);
    panels.set(step, panel);
    return panel;
  };

  const place = () => {
    // The days within a step of the front are in view; the rest aren't made.
    for (let step = Math.floor(position - 1); step <= Math.ceil(position + 1); step++) {
      const offset = step - position;
      if (Math.abs(offset) >= 1) {
        const panel = panels.get(step);
        if (panel) panel.overlay.remove();
        panels.delete(step);
        continue;
      }
      const panel = panelAt(step);
      if (panel) panel.set(offset * distance, pull, 1 - smooth(0.35, 1, Math.abs(offset)));
    }
  };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    panels.forEach((panel) => panel && panel.overlay.remove());
    panels.clear();
    cards.style.visibility = previous.visibility;
    stage.style.perspective = previous.perspective;
    if (onSettled) onSettled();
  };

  const tick = (now) => {
    const seconds = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Critically damped spring toward the target, in small steps so it's the same at any frame rate.
    const steps = Math.max(1, Math.ceil(seconds / 0.004));
    for (let n = 0; n < steps; n++) {
      const dt = seconds / steps;
      const gap = target - position;
      const springPull = SPRING * SPRING * gap - 2 * SPRING * velocity;
      // The steady speed (one step in the settling time), ramped down over the last bit so it
      // stops there; the velocity is brought to it quickly, not at once, so aiming the wheel
      // again never makes it jump.
      const cruise = Math.sign(gap) * (1000 / wheelTuning.settleMs) * Math.min(1, Math.abs(gap) / 0.02);
      const steadyPull = (cruise - velocity) * 30;
      velocity += (wheelTuning.easeOut * springPull + (1 - wheelTuning.easeOut) * steadyPull) * dt;
      position += velocity * dt;
    }
    // Pulled back by how fast it's going, easing in and out of it.
    const topSpeed = wheelTuning.easeOut * SPRING * 0.37 + (1 - wheelTuning.easeOut) * (900 / wheelTuning.settleMs);
    const wanted = wheelTuning.pullBack * clamp01(Math.abs(velocity) / topSpeed);
    pull += (wanted - pull) * (1 - Math.exp(-seconds * 12));
    if (Math.abs(target - position) < 0.0008 && Math.abs(velocity) < 0.01) {
      position = target;
      pull = 0;
      finish();
      return;
    }
    place();
    frame = requestAnimationFrame(tick);
  };

  place();
  last = performance.now();
  frame = requestAnimationFrame(tick);
  return {
    goTo(step) {
      target = step;
    },
    end: finish,
  };
}
