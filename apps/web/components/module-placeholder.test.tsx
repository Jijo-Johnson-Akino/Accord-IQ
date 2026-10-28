import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../lib/navigation";
import { ModulePlaceholder } from "./module-placeholder";

describe("ModulePlaceholder", () => {
  it("renders an honest empty state for every unimplemented section", () => {
    const unimplemented = NAV_ITEMS.filter((item) => !item.implemented);
    expect(unimplemented.length).toBeGreaterThan(0);
    for (const item of unimplemented) {
      const markup = renderToStaticMarkup(<ModulePlaceholder href={item.href} />);
      expect(markup, item.href).toContain("Not connected yet");
      expect(markup, item.href).toContain(item.label.replaceAll("&", "&amp;"));
      expect(markup, item.href).not.toContain("undefined");
    }
  });
});
