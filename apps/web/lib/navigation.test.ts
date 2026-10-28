import { describe, expect, it } from "vitest";
import {
  breadcrumbsFor,
  filterNavItems,
  isNavActive,
  NAV_GROUPS,
  NAV_ITEMS,
  OVERVIEW_HREF,
} from "./navigation";

describe("navigation config", () => {
  it("lists the 13 required sections in order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Overview",
      "Contracts",
      "AI Contract Studio",
      "Approvals",
      "Obligations",
      "Vendors",
      "Financial Intelligence",
      "Clause Library",
      "Workflows",
      "Reports & Analytics",
      "Integrations",
      "Activity & Audit Logs",
      "Settings",
    ]);
  });

  it("gives every item a unique href starting with /", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.startsWith("/") && href !== "/")).toBe(true);
  });

  it("marks Overview, Contracts, Studio, Approvals, Obligations, Finance, Clauses, Workflows, Integrations, and Settings as implemented", () => {
    expect(NAV_ITEMS.filter((item) => item.implemented).map((item) => item.href)).toEqual([
      OVERVIEW_HREF,
      "/contracts",
      "/studio",
      "/approvals",
      "/obligations",
      "/finance",
      "/clauses",
      "/workflows",
      "/integrations",
      "/settings",
    ]);
  });

  it("groups items without dropping any", () => {
    expect(NAV_GROUPS.flatMap((group) => group.items)).toEqual(NAV_ITEMS);
  });
});

describe("isNavActive", () => {
  it("matches Overview only on its own path", () => {
    expect(isNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavActive("/dashboard", "/contracts")).toBe(false);
  });

  it("matches nested paths of a section, but not a prefix sibling", () => {
    expect(isNavActive("/contracts", "/contracts")).toBe(true);
    expect(isNavActive("/contracts", "/contracts/abc")).toBe(true);
    expect(isNavActive("/contracts", "/contracts-archive")).toBe(false);
  });
});

describe("breadcrumbsFor", () => {
  it("is a single current crumb on Overview", () => {
    expect(breadcrumbsFor("/dashboard")).toEqual([{ label: "Overview" }]);
  });

  it("prefixes other sections with Overview", () => {
    expect(breadcrumbsFor("/contracts")).toEqual([
      { href: "/dashboard", label: "Overview" },
      { label: "Contracts" },
    ]);
  });

  it("adds a Contract crumb on a contract details path", () => {
    expect(breadcrumbsFor("/contracts/abc")).toEqual([
      { href: "/dashboard", label: "Overview" },
      { href: "/contracts", label: "Contracts" },
      { label: "Contract" },
    ]);
  });

  it("adds a Clause crumb on a clause details path", () => {
    expect(breadcrumbsFor("/clauses/abc")).toEqual([
      { href: "/dashboard", label: "Overview" },
      { href: "/clauses", label: "Clause Library" },
      { label: "Clause" },
    ]);
  });

  it("adds a Request crumb on an approval details path", () => {
    expect(breadcrumbsFor("/approvals/abc")).toEqual([
      { href: "/dashboard", label: "Overview" },
      { href: "/approvals", label: "Approvals" },
      { label: "Request" },
    ]);
  });
});

describe("filterNavItems", () => {
  it("returns every item for a blank query", () => {
    expect(filterNavItems("   ")).toHaveLength(NAV_ITEMS.length);
  });

  it("matches label and description, case-insensitively", () => {
    expect(filterNavItems("studio").map((item) => item.href)).toEqual(["/studio"]);
    expect(filterNavItems("e-signature").map((item) => item.href)).toEqual(["/integrations"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterNavItems("xyzzy-no-such-section")).toEqual([]);
  });
});
