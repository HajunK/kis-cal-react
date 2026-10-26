// "Made by Hajun Kim", at the foot of every guide page (loaded through
// guide-ui.js). Centered in the window, not the page: when a page is zoomed wide
// enough to scroll sideways it stays put (--view is the window's width, set by
// zoom.js; a page with no zoom control just uses its own width).
const article = document.querySelector(".article");
if (article) {
  const footer = document.createElement("footer");
  footer.className = "guide-footer";
  footer.textContent = "Made by Hajun Kim";
  article.after(footer);
}
