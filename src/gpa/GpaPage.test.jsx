// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeBlankText } from "../legacy/page.js";
import { GpaPage } from "./GpaPage.jsx";

// Stands in for animateNumberChange: records each call and shows the text.
function fakePage({ periods = ["English", "AP Biology", "Lunch"], gpaClasses = [], domainSnapshot = [], ready = true } = {}) {
  const page = {
    ready,
    saves: [],
    rolls: [],
    data: () => ({ periods, gpaClasses, domainSnapshot }),
    saveGpaClasses: (classes) => page.saves.push(classes),
    fetchDomainSnapshot: vi.fn(() => Promise.resolve(domainSnapshot)),
    animateNumber: (element, text, style) => {
      page.rolls.push({ className: element.className, text, style });
      element.textContent = text;
    },
    roll: { rollMs: 800, staggerMs: 60 },
  };
  return page;
}

const rows = () => [...document.querySelectorAll(".gpa-class-row")];
const row = (name) => rows().find((el) => el.querySelector(".gpa-class-name").textContent === name);
const badge = (name) => row(name).querySelector(".gpa-grade-badge-btn");
const value = (className) => document.querySelector(`.${className}`).textContent;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hydrating gpa.html", () => {
  it("takes over the page's own markup without rebuilding it", async () => {
    const html = readFileSync(resolve(process.cwd(), "gpa.html"), "utf8");
    const start = html.indexOf('<div class="page-content" id="gpa-root">');
    const end = html.indexOf('<p class="page-footer">');
    document.body.innerHTML = html.slice(start, end);
    const container = document.getElementById("gpa-root");
    removeBlankText(container);
    const layout = container.querySelector(".gpa-layout");
    const errors = [];
    const mismatch = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args.join(" ")));

    let root;
    await act(async () => {
      root = hydrateRoot(container, <GpaPage page={fakePage({ ready: false })} />, {
        onRecoverableError: (error) => errors.push(String(error)),
      });
    });
    expect(errors).toEqual([]);
    expect(container.querySelector(".gpa-layout")).toBe(layout);

    await act(async () => root.render(<GpaPage page={fakePage()} />));
    expect(container.querySelector(".gpa-layout")).toBe(layout);
    expect(rows()).toHaveLength(3);
    mismatch.mockRestore();
    await act(async () => root.unmount());
  });
});

describe("GpaPage", () => {
  it("lists the courses, saves them once on load, and shows the GPA without rolling", () => {
    const page = fakePage({ gpaClasses: [{ name: "English", slug: "a", label: "A" }] });
    render(<GpaPage page={page} />);
    expect(rows().map((el) => el.querySelector(".gpa-class-name").textContent)).toEqual(["English", "AP Biology", "Lunch"]);
    expect(page.saves).toEqual([
      [
        { name: "English", slug: "a", label: "A" },
        { name: "AP Biology", slug: null, label: null },
        { name: "Lunch", slug: null, label: null },
      ],
    ]);
    expect(badge("English").querySelector("img").getAttribute("src")).toBe("grade-icons/a.png");
    expect(badge("AP Biology").querySelector(".grade-badge--empty")).toBeTruthy();
    // An AP course is taken, so both values show.
    expect(value("gpa-unweighted")).toBe("4.0000");
    expect(page.rolls.filter((roll) => roll.style !== "instant")).toEqual([]);
    expect(document.querySelector(".gpa-summary-item--combined").hidden).toBe(true);
  });

  it("shows one combined value without AP courses", () => {
    render(<GpaPage page={fakePage({ periods: ["English"], gpaClasses: [{ name: "English", slug: "b", label: "B" }] })} />);
    expect(document.querySelector(".gpa-summary-item--combined").hidden).toBe(false);
    expect(value("gpa-combined")).toBe("3.0000");
  });

  it("picks a grade from the dropdown, saving it and rolling the GPA", () => {
    const page = fakePage();
    render(<GpaPage page={page} />);
    fireEvent.click(badge("AP Biology"));
    const dropdown = row("AP Biology").querySelector(".gpa-grade-dropdown");
    expect(dropdown.className).toBe("gpa-grade-dropdown gpa-grade-dropdown--visible");
    fireEvent.click(within(dropdown).getByAltText("B+"));

    expect(page.saves.at(-1)).toEqual([
      { name: "English", slug: null, label: null },
      { name: "AP Biology", slug: "b-plus", label: "B+" },
      { name: "Lunch", slug: null, label: null },
    ]);
    expect(row("AP Biology").dataset.slug).toBe("b-plus");
    expect(dropdown.className).toBe("gpa-grade-dropdown");
    expect(page.rolls.at(-1)).toEqual({ className: "gpa-weighted", text: "4.3330", style: "blur" });
  });

  it("folds the instructions away on the first pick only", () => {
    render(<GpaPage page={fakePage()} />);
    const description = document.querySelector(".gpa-classes-description");
    fireEvent.click(row("English").querySelector(".gpa-clear-btn"));
    expect(description.style.height).toBe("");
    fireEvent.click(badge("English"));
    fireEvent.click(within(row("English")).getByAltText("A"));
    expect(description.style.height).toBe("0px");
  });

  it("clears a grade", () => {
    const page = fakePage({ gpaClasses: [{ name: "English", slug: "a", label: "A" }] });
    render(<GpaPage page={page} />);
    fireEvent.click(row("English").querySelector(".gpa-clear-btn"));
    expect(page.saves.at(-1)[0]).toEqual({ name: "English", slug: null, label: null });
    expect(row("English").dataset.slug).toBe("");
  });

  it("closes the dropdown on a click elsewhere, emptying it after its fade", () => {
    vi.useFakeTimers();
    render(<GpaPage page={fakePage()} />);
    fireEvent.click(badge("English"));
    const dropdown = row("English").querySelector(".gpa-grade-dropdown");
    fireEvent.click(document.body);
    expect(dropdown.className).toBe("gpa-grade-dropdown");
    expect(dropdown.children).toHaveLength(1);
    act(() => vi.advanceTimersByTime(180));
    expect(dropdown.children).toHaveLength(0);
  });

  it("steps through grades on scroll, one tier per flick", () => {
    vi.useFakeTimers();
    const page = fakePage();
    render(<GpaPage page={page} />);
    fireEvent.wheel(badge("English"), { deltaY: 20 });
    expect(page.saves).toHaveLength(1);
    fireEvent.wheel(badge("English"), { deltaY: 25 });
    expect(page.saves.at(-1)[0]).toEqual({ name: "English", slug: "a-plus", label: "A+" });
    // Within the cooldown, nothing moves.
    fireEvent.wheel(badge("English"), { deltaY: 60 });
    expect(page.saves.at(-1)[0].slug).toBe("a-plus");
    vi.advanceTimersByTime(130);
    fireEvent.wheel(badge("English"), { deltaY: 60 });
    expect(page.saves.at(-1)[0]).toEqual({ name: "English", slug: "a", label: "A" });
    act(() => vi.advanceTimersByTime(300));
  });

  it("pastes Domain's grades after at least a second, then waits for a change", async () => {
    vi.useFakeTimers();
    const domainSnapshot = [{ name: "English", slug: "c", label: "C" }];
    const page = fakePage({ gpaClasses: [{ name: "English", slug: "a", label: "A" }], domainSnapshot });
    render(<GpaPage page={page} />);
    const button = screen.getByRole("button", { name: "Paste from Domain Tab" });
    fireEvent.click(button);
    expect(button.textContent).toBe("Pasting letter grades...");
    expect(button.disabled).toBe(true);

    await act(async () => vi.advanceTimersByTime(999));
    expect(page.saves).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(page.saves.at(-1)).toEqual([
      { name: "English", slug: "c", label: "C" },
      { name: "AP Biology", slug: null, label: null },
      { name: "Lunch", slug: null, label: null },
    ]);
    expect(button.textContent).toBe("Successfully Pasted!");
    expect(button.disabled).toBe(true);

    // The badges flip in one after another.
    act(() => vi.advanceTimersByTime(200));
    expect(badge("English").querySelector("img").getAttribute("src")).toBe("grade-icons/c.png");

    fireEvent.click(row("English").querySelector(".gpa-clear-btn"));
    expect(button.textContent).toBe("Paste from Domain Tab");
    expect(button.disabled).toBe(false);
  });
});
