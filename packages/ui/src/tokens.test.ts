import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors, type ColorToken } from "./tokens";

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (a + 0.05) / (b + 0.05);
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("brand palette", () => {
  it("uses the exact brand colors from the brief", () => {
    expect(colors).toMatchObject({
      navy: "#142C4E",
      primary: "#4169E1",
      primarySoft: "#EAF1FF",
      background: "#F7F9FC",
      surface: "#FFFFFF",
      ink: "#172033",
      inkMuted: "#687386",
      line: "#E3E8F0",
      success: "#16845B",
      warning: "#B7791F",
      error: "#C43D4B",
    });
  });

  it("is mirrored exactly in styles.css", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").toLowerCase();
    const toKebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    for (const [key, hex] of Object.entries(colors)) {
      const declaration = `--color-${toKebab(key)}: ${hex.toLowerCase()};`;
      expect(css, `missing or mismatched ${declaration}`).toContain(declaration);
    }
  });
});

describe("CSS variable hygiene", () => {
  // Regression: a leftover `var(--color-paper)` silently made the page background transparent.
  it("never references an undefined --color-* variable", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const tokensCss = read("./styles.css");
    const defined = new Set([...tokensCss.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]));
    const files = {
      "packages/ui/src/styles.css": tokensCss,
      "apps/web/app/globals.css": read("../../../apps/web/app/globals.css"),
    };
    for (const [name, css] of Object.entries(files)) {
      const used = [...css.matchAll(/var\((--color-[\w-]+)/g)].map((m) => m[1]);
      const undefinedVars = used.filter((variable) => !defined.has(variable));
      expect(undefinedVars, `${name} references undefined variables`).toEqual([]);
    }
  });
});

describe("WCAG contrast", () => {
  const textPairs: Array<[ColorToken, ColorToken]> = [
    ["ink", "surface"],
    ["ink", "background"],
    ["ink", "primarySoft"],
    ["inkMuted", "surface"],
    ["inkMuted", "background"],
    ["surface", "navy"],
    ["surface", "primary"],
    ["surface", "primaryHover"],
    ["surface", "error"],
    ["primary", "surface"],
    ["primary", "background"],
    ["primaryStrong", "primarySoft"],
    ["successStrong", "successSoft"],
    ["warningStrong", "warningSoft"],
    ["errorStrong", "errorSoft"],
    ["successStrong", "surface"],
    ["warningStrong", "surface"],
    ["errorStrong", "surface"],
    ["navy", "background"],
  ];

  it.each(textPairs)("text %s on %s meets AA (4.5:1)", (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const nonTextPairs: Array<[ColorToken, ColorToken]> = [
    ["lineStrong", "surface"],
    ["lineStrong", "background"],
    ["primary", "background"], // focus ring
    ["success", "surface"],
    ["warning", "surface"],
    ["error", "surface"],
  ];

  it.each(nonTextPairs)("UI element %s on %s meets 3:1", (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
