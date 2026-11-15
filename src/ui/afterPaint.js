// Runs `work` once the frame showing the click's animation has been drawn, so
// whatever a button has to process never holds that animation back.
export function afterPaint(work) {
  requestAnimationFrame(() => setTimeout(work, 0));
}
