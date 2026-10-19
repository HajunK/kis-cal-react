// Inter for every tab after the first. The @font-face in tokens.css is
// font-display: optional, so a first visit whose font isn't ready within the
// first moment draws in the fallback font, and Chrome then keeps that font
// for as long as the page is open, even once Inter has arrived. Tabs now
// switch without a page load, so that would be every tab until a reload.
// Instead the same file is loaded again here (from the cache: the page
// preloads it) and put in place as the next tab is drawn, where the change
// of font goes unseen among everything else changing. Where the CSS face was
// in use all along, this one draws exactly the same.

let face = null;
let wanted = false;
let added = false;

const add = () => {
  if (added || !wanted || face?.status !== "loaded") return;
  added = true;
  document.fonts.add(face);
};

if (typeof FontFace !== "undefined" && document.fonts) {
  face = new FontFace("Inter", 'url("/fonts/inter-latin.woff2") format("woff2")', {
    style: "normal",
    weight: "100 900",
    // The same characters as tokens.css's face.
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  });
  face.load().then(add, () => {});
}

// Called as a tab other than the first is drawn: from then on, Inter. Safe to
// call any number of times.
export function switchToInter() {
  wanted = true;
  add();
}
