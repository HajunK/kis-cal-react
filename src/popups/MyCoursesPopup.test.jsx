// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyCoursesPopup } from "./MyCoursesPopup.jsx";

// appData's three fields, saved the way main.jsx saves them.
function fakePage(initial = {}) {
  const appData = { periods: [], periodDivisions: [], hiddenCourses: [], ...structuredClone(initial) };
  const page = {
    appData,
    saves: 0,
    toasts: [],
    refreshes: [],
    periods: () => appData.periods,
    savePeriods: (periods) => {
      appData.periods = periods;
      page.saves++;
    },
    divisions: () => appData.periodDivisions || [],
    saveDivisions: (divisions) => {
      appData.periodDivisions = Array.from({ length: divisions.length }, (_, i) => divisions[i] || "");
      page.saves++;
    },
    hidden: () => appData.hiddenCourses || [],
    saveHidden: (names) => {
      appData.hiddenCourses = names;
      page.saves++;
    },
    toast: (message) => page.toasts.push(message),
    refreshCalendar: () => page.refreshes.push("calendar"),
    refreshDomain: () => page.refreshes.push("domain"),
    uiIconPath: (name) => `icons/light/${name}`,
    close: vi.fn(),
  };
  return page;
}

const input = (period) => document.querySelector(`.schedule-input[data-period="${period}"]`);
const row = (period) => input(period).closest(".schedule-row");
const dropdownItems = () => [...document.querySelectorAll(".schedule-dropdown--floating .schedule-dropdown-item")].map((li) => li.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom doesn't lay anything out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MyCoursesPopup", () => {
  it("opens on an empty account ready to type in Period 1", () => {
    render(<MyCoursesPopup page={fakePage()} open />);
    expect(document.querySelectorAll(".schedule-row")).toHaveLength(8);
    expect(input(0).placeholder).toBe("Start typing here");
    expect(input(1).hasAttribute("placeholder")).toBe(false);
    expect(document.activeElement).toBe(input(0));
  });

  it("opens on a chosen period", () => {
    render(<MyCoursesPopup page={fakePage({ periods: ["English", "Geometry"] })} focusPeriod={1} open />);
    expect(document.activeElement).toBe(input(1));
    expect(input(0).placeholder).toBe("");
  });

  it("saves as it's typed, and redraws the tab underneath once a course is picked", () => {
    const page = fakePage();
    render(<MyCoursesPopup page={page} open />);
    fireEvent.change(input(2), { target: { value: "Geom" } });
    expect(page.appData.periods[2]).toBe("Geom");
    expect(page.refreshes).toEqual([]);
    expect(dropdownItems()).toEqual(["Geometry"]);

    fireEvent.mouseDown(document.querySelector(".schedule-dropdown-item"));
    expect(input(2).value).toBe("Geometry");
    expect(page.appData.periods[2]).toBe("Geometry");
    expect(page.refreshes).toEqual(["calendar", "domain"]);
    expect(row(2).querySelector(".schedule-field").className).toBe("schedule-field has-value");
  });

  it("picks the highlighted suggestion with Enter and moves to the next period", () => {
    const page = fakePage();
    render(<MyCoursesPopup page={page} open />);
    input(0).focus();
    fireEvent.change(input(0), { target: { value: "ap bio" } });
    fireEvent.keyDown(input(0), { key: "ArrowDown" });
    expect(document.querySelector(".schedule-dropdown-item--highlighted").textContent).toBe("AP Biology");
    fireEvent.keyDown(input(0), { key: "Enter" });
    expect(page.appData.periods[0]).toBe("AP Biology");
    expect(document.activeElement).toBe(input(1));
  });

  it("clears a course that doesn't exist, with a warning", () => {
    const page = fakePage();
    render(<MyCoursesPopup page={page} open />);
    input(3).focus();
    fireEvent.change(input(3), { target: { value: "Basket Weaving" } });
    fireEvent.blur(input(3));
    expect(page.toasts).toEqual(["The course you typed does not exist."]);
    expect(input(3).value).toBe("");
    expect(page.appData.periods[3]).toBe("");
  });

  it("asks for a division, and saves the pick with every period filled", () => {
    const page = fakePage({ periods: ["", "", "English"] });
    render(<MyCoursesPopup page={page} open />);
    const picker = row(2).querySelector(".division-picker");
    expect(picker.hidden).toBe(false);
    expect(picker.querySelector(".division-picker-label").textContent).toBe("Select division");
    fireEvent.click([...picker.querySelectorAll(".division-option")].find((btn) => btn.textContent === "10"));
    expect(page.appData.periodDivisions).toEqual(["", "", "10"]);
    expect(picker.querySelector(".division-option--selected").textContent).toBe("10");
    expect(picker.querySelector(".division-picker-label")).toBe(null);
    expect(page.refreshes).toEqual(["calendar", "domain"]);
  });

  it("clears a saved division the course doesn't have, on opening", () => {
    const page = fakePage({ periods: ["Geometry", "English"], periodDivisions: ["AB", "10"] });
    render(<MyCoursesPopup page={page} open />);
    expect(page.appData.periodDivisions).toEqual(["", "10"]);
    expect(row(0).querySelector(".division-picker").hidden).toBe(true);
  });

  it("shows a hidden course again", () => {
    const page = fakePage({ periods: ["Korean"], hiddenCourses: ["Korean SS", "Physics"] });
    render(<MyCoursesPopup page={page} open />);
    const button = row(0).querySelector(".show-course-btn");
    expect(button.hidden).toBe(false);
    expect(button.querySelector("img").getAttribute("src")).toBe("icons/light/show.png");
    fireEvent.click(button);
    expect(page.appData.hiddenCourses).toEqual(["Physics"]);
    expect(button.hidden).toBe(true);
    expect(page.toasts).toEqual(["View Korean in the Domain Tab"]);
  });

  it("clears a period with its X, without suggesting the course it had", () => {
    const page = fakePage({ periods: ["English"] });
    render(<MyCoursesPopup page={page} open />);
    fireEvent.click(row(0).querySelector(".schedule-clear-btn"));
    expect(page.appData.periods[0]).toBe("");
    expect(document.activeElement).toBe(input(0));
    expect(dropdownItems()).toEqual([]);
  });

  it("hides the suggestions a moment after leaving the field", () => {
    render(<MyCoursesPopup page={fakePage()} open />);
    input(0).focus();
    fireEvent.change(input(0), { target: { value: "chem" } });
    expect(dropdownItems().length).toBeGreaterThan(0);
    fireEvent.blur(input(0));
    expect(dropdownItems().length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(100));
    expect(dropdownItems()).toEqual([]);
  });

  it("drops its suggestion lists the moment it closes", () => {
    const { rerender } = render(<MyCoursesPopup page={fakePage()} open />);
    expect(document.querySelectorAll(".schedule-dropdown--floating")).toHaveLength(8);
    rerender(<MyCoursesPopup page={fakePage()} open={false} />);
    expect(document.querySelectorAll(".schedule-dropdown--floating")).toHaveLength(0);
  });

  it("closes with its X", () => {
    const page = fakePage();
    render(<MyCoursesPopup page={page} open />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(page.close).toHaveBeenCalled();
  });
});
