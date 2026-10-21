// A small Markdown renderer for guide bodies. Everything is escaped first, and
// only a few shapes are turned back into tags, so what an admin types can't
// bring in a script or an event handler: links are http(s)/mailto only, images
// https only.

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// A URL that's been escaped (so & is &amp;) and passes for what's allowed.
const safeUrl = (url, schemes) => {
  const raw = url.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  try {
    const parsed = new URL(raw);
    return schemes.includes(parsed.protocol) ? escapeHtml(parsed.href) : null;
  } catch {
    return null;
  }
};

function inline(escaped) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let text = escaped.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
    const src = safeUrl(url, ["https:"]);
    return src ? keep(`<img src="${src}" alt="${alt}" loading="lazy">`) : match;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const href = safeUrl(url, ["http:", "https:", "mailto:"]);
    return href ? keep(`<a href="${href}" rel="noopener noreferrer">${label}</a>`) : match;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]);
}

export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    } else if (/^(#{1,3})\s+/.test(line)) {
      const [, hashes, text] = /^(#{1,3})\s+(.*)$/.exec(line);
      const level = hashes.length + 1; // the page's own title is the h1
      html.push(`<h${level}>${inline(escapeHtml(text.trim()))}</h${level}>`);
      i++;
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push("<hr>");
      i++;
    } else if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${inline(escapeHtml(quote.join(" ")))}</blockquote>`);
    } else if (/^\s*([-*])\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const itemPattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items = [];
      while (i < lines.length && itemPattern.test(lines[i])) items.push(`<li>${inline(escapeHtml(itemPattern.exec(lines[i++])[1]))}</li>`);
      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
    } else {
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s|-{3,}\s*$)/.test(lines[i])) paragraph.push(lines[i++].trim());
      html.push(`<p>${inline(escapeHtml(paragraph.join(" ")))}</p>`);
    }
  }
  return html.join("\n");
}
