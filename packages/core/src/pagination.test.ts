import { describe, expect, it } from "vitest";
import { likeContains, parsePage } from "./pagination";

describe("parsePage", () => {
  it("applies defaults and clamps limit", () => {
    expect(parsePage(new URLSearchParams())).toEqual({ limit: 20, offset: 0, q: undefined });
    expect(parsePage(new URLSearchParams("limit=500&offset=-3")).limit).toBe(100);
    expect(parsePage(new URLSearchParams("offset=-3")).offset).toBe(0);
    expect(parsePage(new URLSearchParams("q=  msa  ")).q).toBe("msa");
  });
});

describe("likeContains", () => {
  it("strips wildcard characters from user input", () => {
    expect(likeContains("%secret_")).toBe("%secret%");
  });
});
