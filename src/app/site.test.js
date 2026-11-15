import { describe, expect, it } from "vitest";
import { adminSiteUrl, isAdminSite, studentSiteUrl } from "./site.js";

describe("which site", () => {
  it("is the admin site on admin. hosts only", () => {
    expect(isAdminSite("admin.kiscal.app")).toBe(true);
    expect(isAdminSite("admin.localhost")).toBe(true);
    expect(isAdminSite("kiscal.app")).toBe(false);
    expect(isAdminSite("localhost")).toBe(false);
    expect(isAdminSite("guides.kiscal.app")).toBe(false);
  });
});

describe("links between the sites", () => {
  const at = (hostname, port = "", protocol = "https:") => ({ hostname, port, protocol });

  it("go to the real admin site, or admin.localhost when developing", () => {
    expect(adminSiteUrl(at("kiscal.app"))).toBe("https://admin.kiscal.app/assessments");
    expect(adminSiteUrl(at("kisj-grade-calculator.web.app"))).toBe("https://admin.kiscal.app/assessments");
    expect(adminSiteUrl(at("localhost", "3000", "http:"))).toBe("http://admin.localhost:3000/assessments");
  });

  it("come back from the admin site", () => {
    expect(studentSiteUrl(at("admin.kiscal.app"))).toBe("https://kiscal.app/");
    expect(studentSiteUrl(at("admin.localhost", "3000", "http:"))).toBe("http://localhost:3000/");
  });
});
