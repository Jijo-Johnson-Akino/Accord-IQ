import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok without leaking configuration", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("AccordIQ");
    expect(Object.keys(body).sort()).toEqual(["service", "status", "time"]);
  });
});
