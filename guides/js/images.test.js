import { describe, expect, it } from "vitest";
import { cropRect, fitWithin } from "./images.js";

describe("cropRect", () => {
  it("takes the middle of a taller picture at 16:9", () => {
    expect(cropRect(1000, 1000, 16 / 9)).toEqual({ x: 0, y: 219, width: 1000, height: 563 });
  });

  it("takes the middle of a wider picture", () => {
    expect(cropRect(3000, 1000, 16 / 9)).toEqual({ x: 611, y: 0, width: 1778, height: 1000 });
  });

  it("keeps a picture that's already 16:9", () => {
    expect(cropRect(1600, 900, 16 / 9)).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
  });
});

describe("fitWithin", () => {
  it("shrinks the longer side to the limit, keeping the shape, and never enlarges", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
