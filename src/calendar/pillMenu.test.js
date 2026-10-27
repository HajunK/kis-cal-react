// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cardShapePath, sideFor, visibleArea } from "./pillMenu.js";

// The path's commands, each with its numbers: [["M", [x, y]], ["A", [rx, ry, 0, 0, 1, x, y]], ...].
const commands = (path) =>
  [...path.matchAll(/([MLAZ])([^MLAZ]*)/g)].map(([, letter, rest]) => [letter, (rest.match(/-?\d+(\.\d+)?/g) || []).map(Number)]);
// Where each command ends.
const ends = (path) => commands(path).filter(([letter]) => letter !== "Z").map(([, values]) => values.slice(-2));

describe("the details card's outline", () => {
  it("is a closed rounded rectangle with no point", () => {
    const path = cardShapePath(288, 200, 18);
    expect(path.startsWith("M 18 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    const xs = ends(path).map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(288);
  });

  it("rounds its corners with circles, not a squircle's curve", () => {
    const arcs = commands(cardShapePath(288, 200, 18)).filter(([letter]) => letter === "A");
    expect(arcs).toHaveLength(4);
    // A circular arc: equal radii, no rotation, small arc, drawn clockwise.
    arcs.forEach(([, values]) => expect(values.slice(0, 5)).toEqual([18, 18, 0, 0, 1]));
    // And nothing but straight lines and those arcs: no free-form curves.
    expect(cardShapePath(288, 200, 18)).not.toMatch(/[CQSTcqst]/);
  });

  it("sticks a point out of the left edge, level with where it's asked, inside the room given", () => {
    const path = cardShapePath(288, 200, 18, { side: "left", y: 90, depth: 10, half: 11 }, 16);
    // The point's base sits on the edge (x = 16 there), `half` either side of y.
    expect(path).toContain("L 16 101");
    expect(path).toContain("L 16 79");
    // Its tip is rounded off with a circle of radius 3.
    const arcs = commands(path).filter(([letter]) => letter === "A");
    expect(arcs).toHaveLength(5);
    expect(arcs.filter(([, values]) => values[0] === 3)).toHaveLength(1);
    const xs = ends(path).map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...xs)).toBeLessThan(16);
    expect(Math.max(...xs)).toBe(16 + 288);
  });

  it("rounds the tip with a circle that touches both of the point's sides", () => {
    // The sides run from the base (0, y ± half) toward the sharp tip (-depth, y); the circle's
    // two ends are on them, so each end is the same distance from the tip along its side.
    const point = { side: "left", y: 90, depth: 10, half: 11 };
    const path = cardShapePath(288, 200, 18, point, 0);
    const lines = commands(path).filter(([letter]) => letter === "L").map(([, values]) => values);
    const arcTip = commands(path).filter(([letter]) => letter === "A").find(([, values]) => values[0] === 3)[1];
    const lower = lines.find(([x, yy]) => x < 0 && yy > 90);
    const upper = [arcTip[5], arcTip[6]];
    expect(lower[0]).toBeCloseTo(arcTip[5], 1);
    expect(lower[1] - 90).toBeCloseTo(90 - upper[1], 1);
    // On the side: the line from the base (0, 101) to the sharp tip (-10, 90).
    const along = (lower[1] - 101) / (lower[0] - 0);
    expect(along).toBeCloseTo((90 - 101) / (-10 - 0), 1);
  });

  it("sticks one out of the right edge instead", () => {
    const path = cardShapePath(288, 200, 18, { side: "right", y: 60, depth: 10, half: 11 }, 16);
    expect(path).toContain(`L ${16 + 288} 49`);
    expect(path).toContain(`L ${16 + 288} 71`);
    const xs = ends(path).map(([x]) => x);
    expect(Math.max(...xs)).toBeGreaterThan(16 + 288);
    expect(Math.max(...xs)).toBeLessThanOrEqual(16 + 288 + 10);
    expect(commands(path).filter(([letter]) => letter === "A")).toHaveLength(5);
  });

  it("has a point on one side only", () => {
    const left = cardShapePath(288, 200, 18, { side: "left", y: 90, depth: 10, half: 11 });
    expect(commands(left).filter(([letter]) => letter === "A")).toHaveLength(5);
    const xs = ends(left).map(([x]) => x);
    expect(Math.max(...xs)).toBe(288);
  });
});

describe("which side of the pill the card goes", () => {
  const area = { left: 0, top: 0, right: 1500, bottom: 900 };
  const base = { depth: 10, width: 288 };

  it("goes to the right when it fits there", () => {
    expect(sideFor({ ...base, area, tipLeft: 450, tipRight: 615 })).toEqual({ side: "right", width: 288 });
  });

  it("goes to the left when there's no room on the right", () => {
    // The window's right edge is 50px past the pill: nowhere near 288.
    expect(sideFor({ ...base, area: { ...area, right: 665 }, tipLeft: 450, tipRight: 615 })).toEqual({ side: "left", width: 288 });
  });

  it("keeps to the right when both sides have room", () => {
    expect(sideFor({ ...base, area, tipLeft: 700, tipRight: 800 }).side).toBe("right");
  });

  it("narrows to the side with more room when neither is wide enough, if it's still readable", () => {
    // 610px wide: 262px of room on the right of the pill, 102 on the left.
    expect(sideFor({ ...base, area: { ...area, right: 610 }, tipLeft: 120, tipRight: 330 })).toEqual({ side: "right", width: 262 });
    // The same the other way round.
    expect(sideFor({ ...base, area: { ...area, right: 610 }, tipLeft: 280, tipRight: 480 })).toEqual({ side: "left", width: 262 });
  });

  it("gives up (the card goes under the pill) when neither side has room to read", () => {
    expect(sideFor({ ...base, area: { ...area, right: 600 }, tipLeft: 200, tipRight: 400 })).toBe(null);
  });

  it("judges room by what's on screen, not the whole window", () => {
    // A page zoomed in to 2x on a 1500px window shows 750px: the pill's right side is out of view.
    const zoomed = { left: 0, top: 0, right: 750, bottom: 450 };
    expect(sideFor({ ...base, area: zoomed, tipLeft: 461, tipRight: 615 })).toEqual({ side: "left", width: 288 });
    // And a view scrolled along keeps the room on its own left edge.
    const panned = { left: 300, top: 0, right: 1050, bottom: 450 };
    expect(sideFor({ ...base, area: panned, tipLeft: 330, tipRight: 480 })).toEqual({ side: "right", width: 288 });
  });
});

describe("the visible area", () => {
  afterEach(() => {
    delete window.visualViewport;
  });

  it("is the whole window when the page isn't zoomed", () => {
    window.visualViewport = undefined;
    expect(visibleArea()).toEqual({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
  });

  it("is the part of it a zoomed page shows", () => {
    window.visualViewport = { offsetLeft: 120, offsetTop: 40, width: 750, height: 450 };
    expect(visibleArea()).toEqual({ left: 120, top: 40, right: 870, bottom: 490 });
  });
});
