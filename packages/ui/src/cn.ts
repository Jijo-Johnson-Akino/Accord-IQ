import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge needs to know our custom type scale (`text-small`, `text-h2`, ...). Otherwise it
 * mistakes them for text *colors* and drops real colors such as `text-surface`.
 * Keep in sync with the `--text-*` tokens in styles.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "h4", "lead", "body", "small", "caption"] },
      ],
    },
  },
});

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
