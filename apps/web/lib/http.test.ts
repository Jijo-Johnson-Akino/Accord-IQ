import { describe, expect, it, vi } from "vitest";
import { AppError } from "@accordiq/core";
import { fileResponse, jsonError, jsonOk } from "./http";

describe("jsonError", () => {
  it("maps AppError to the matching status and does not leak internals", async () => {
    const response = jsonError(new AppError("FORBIDDEN", "You do not have permission to do that."));
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: "You do not have permission to do that.",
      code: "FORBIDDEN",
    });
  });

  it("hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = jsonError(new Error("secret stack Bearer sk-live-not-for-logs"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("Something went wrong.");
    expect(JSON.stringify(body)).not.toContain("secret stack");
    expect(JSON.stringify(body)).not.toContain("sk-live-not-for-logs");
    const printed = spy.mock.calls.map((call) => call.map(String).join(" ")).join(" ");
    expect(printed).not.toContain("sk-live-not-for-logs");
    expect(printed).not.toContain("secret stack Bearer");
    spy.mockRestore();
  });
});

describe("jsonOk", () => {
  it("returns JSON with the given status", async () => {
    const response = jsonOk({ id: "1" }, 201);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "1" });
  });
});

describe("fileResponse", () => {
  it("streams bytes privately without exposing a storage key", async () => {
    const response = fileResponse({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      fileName: "msa.pdf",
      disposition: "inline",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="msa.pdf"');
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(JSON.stringify(Object.fromEntries(response.headers.entries()))).not.toContain(
      "storageKey",
    );
  });
});
