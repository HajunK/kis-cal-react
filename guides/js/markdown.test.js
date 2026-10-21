import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("makes headings (one level down, as the page has its own title), paragraphs and emphasis", () => {
    expect(renderMarkdown("# Cells\n\nThe **powerhouse** of the *cell*.")).toBe("<h2>Cells</h2>\n<p>The <strong>powerhouse</strong> of the <em>cell</em>.</p>");
  });

  it("makes lists, quotes, rules and code", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. first\n2. second")).toBe("<ol><li>first</li><li>second</li></ol>");
    expect(renderMarkdown("> be careful")).toBe("<blockquote>be careful</blockquote>");
    expect(renderMarkdown("---")).toBe("<hr>");
    expect(renderMarkdown("Use `x < 3`.")).toBe("<p>Use <code>x &lt; 3</code>.</p>");
    expect(renderMarkdown("```\n<b>raw</b>\n```")).toBe("<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>");
  });

  it("makes links and https images", () => {
    expect(renderMarkdown("[notes](https://example.com/a?x=1&y=2)")).toBe('<p><a href="https://example.com/a?x=1&amp;y=2" rel="noopener noreferrer">notes</a></p>');
    expect(renderMarkdown("![A cell](https://firebasestorage.googleapis.com/x.webp)")).toBe(
      '<p><img src="https://firebasestorage.googleapis.com/x.webp" alt="A cell" loading="lazy"></p>'
    );
  });

  it("can't bring in a script, a handler or a bad address", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script");
    expect(renderMarkdown('<img src=x onerror="alert(1)">')).not.toContain("<img");
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("<a");
    expect(renderMarkdown("[x](data:text/html;base64,AAAA)")).not.toContain("<a");
    expect(renderMarkdown("![x](http://insecure.example/a.png)")).not.toContain("<img");
    expect(renderMarkdown("![x](javascript:alert(1))")).not.toContain("<img");
    expect(renderMarkdown('[a](https://e.com/"onmouseover="alert(1))')).not.toMatch(/onmouseover="/);
    expect(renderMarkdown("**<i>x</i>**")).toBe("<p><strong>&lt;i&gt;x&lt;/i&gt;</strong></p>");
  });

  it("handles nothing at all", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });
});
