// A guide's card, built with DOM calls (never from strings) so a title can't
// bring in markup.
import { minutesLabel } from "./guides.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// "AP Biology" -> "AB", "Geometry" -> "G"
export const initialsOf = (course) =>
  String(course || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

export function guideCard(guide, { admin = false, onEdit = () => {} } = {}) {
  const card = el("li", "card");
  const link = el("a", "card-link");
  link.href = `/${encodeURIComponent(guide.id)}`;

  const thumb = el("div", "thumb");
  if (guide.thumbnailUrl) {
    const image = el("img");
    image.src = guide.thumbnailUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    thumb.append(image);
  } else {
    thumb.append(el("span", "thumb-initials", initialsOf(guide.course) || initialsOf(guide.title)));
  }
  const minutes = minutesLabel(guide.minutes);
  if (minutes) thumb.append(el("span", "badge", minutes));
  if (!guide.published) thumb.append(el("span", "badge badge--draft", "Draft"));

  const meta = [guide.course, guide.test].filter(Boolean).join(" · ");
  link.append(thumb, el("h3", "card-title", guide.title), el("p", "card-meta", meta));
  card.append(link);

  if (admin) {
    const edit = el("button", "card-edit", "Edit");
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit ${guide.title}`);
    edit.addEventListener("click", () => onEdit(guide));
    card.append(edit);
  }
  return card;
}

export function skeletonCard() {
  const card = el("li", "card skeleton");
  card.setAttribute("aria-hidden", "true");
  card.append(el("div", "thumb"), el("div", "line"), el("div", "line line--short"));
  return card;
}
