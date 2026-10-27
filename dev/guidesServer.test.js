import { describe, expect, it } from "vitest";
import { isGuidesHost, resolveGuidesPath } from "./guidesServer.js";

const files = new Set(["index.html", "guide.html", "guides.css", "js/home.js", "biology/index.html", "biology/legend.png"]);
const isFile = (relative) => files.has(relative);

describe("which requests are the guides site's", () => {
  it("is guides.localhost, on any port", () => {
    expect(isGuidesHost("guides.localhost:3000")).toBe(true);
    expect(isGuidesHost("guides.localhost")).toBe(true);
    expect(isGuidesHost("Guides.Localhost:5173")).toBe(true);
    expect(isGuidesHost("localhost:3000")).toBe(false);
    expect(isGuidesHost("evil.guides.localhost:3000")).toBe(false);
    expect(isGuidesHost(undefined)).toBe(false);
  });
});

describe("what a guides path is answered with", () => {
  it("serves the home page for /", () => {
    expect(resolveGuidesPath("/", isFile)).toBe("index.html");
  });

  it("serves a file that exists as it is", () => {
    expect(resolveGuidesPath("/guides.css", isFile)).toBe("guides.css");
    expect(resolveGuidesPath("/js/home.js", isFile)).toBe("js/home.js");
    expect(resolveGuidesPath("/biology/legend.png", isFile)).toBe("biology/legend.png");
  });

  it("serves a folder's index page, with or without the slash", () => {
    expect(resolveGuidesPath("/biology", isFile)).toBe("biology/index.html");
    expect(resolveGuidesPath("/biology/", isFile)).toBe("biology/index.html");
  });

  it("serves a clean URL for an .html file", () => {
    expect(resolveGuidesPath("/guide", isFile)).toBe("guide.html");
  });

  it("serves guide.html for any other path, as the guides site does", () => {
    expect(resolveGuidesPath("/ap-bio-unit-3", isFile)).toBe("guide.html");
    expect(resolveGuidesPath("/js/missing.js", isFile)).toBe("guide.html");
  });

  it("never looks outside guides/", () => {
    expect(resolveGuidesPath("/../package.json", isFile)).toBe("guide.html");
    expect(resolveGuidesPath("/%2e%2e/package.json", isFile)).toBe("guide.html");
    expect(resolveGuidesPath("/%E0%A4%A", isFile)).toBe("guide.html");
  });
});
