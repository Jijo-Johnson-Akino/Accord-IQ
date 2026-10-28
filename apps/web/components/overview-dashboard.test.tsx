import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getOverviewSnapshot } from "../lib/demo-data";
import { OverviewDashboard } from "./overview-dashboard";

describe("OverviewDashboard", () => {
  it("renders empty states and em dashes, not invented counts", () => {
    const markup = renderToStaticMarkup(
      <OverviewDashboard snapshot={getOverviewSnapshot({ NODE_ENV: "development" })} />,
    );
    expect(markup).toContain("Waiting on the contract repository");
    expect(markup).toContain("No activity yet");
    expect(markup).toContain("No upcoming renewals");
    expect(markup).toContain("No data");
    expect(markup).not.toContain("Demo data is on");
    expect(markup).not.toContain(">24<");
  });

  it("labels synthetic figures when demo data is enabled", () => {
    const markup = renderToStaticMarkup(
      <OverviewDashboard
        snapshot={getOverviewSnapshot({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_DATA: "true" })}
      />,
    );
    expect(markup).toContain("Demo data is on");
    expect(markup).toContain("24");
  });
});
